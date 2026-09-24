#!/usr/bin/env bash
# Runs the #27 saved-progress proofs against a throwaway postgres:17
# container: applies the local-supabase stub and both migrations (the
# saved-progress migration twice, to prove it reruns cleanly), runs the RLS
# proof (27_rls_proof.sql) as-is, then runs a live two-session parallel
# purchase check that a real database, not a mock, is needed to prove.
#
# Requires Docker. Nothing here touches real Supabase or stores credentials;
# the container's password is generated per run and thrown away with it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTAINER="jgcp-27-pg"
IMAGE="postgres:17"
PGPASS="$(openssl rand -hex 12)"
FIXTURE_ID="00000000-0000-0000-0000-00000000f1f0"
PLAYER_B_ID="b2222222-2222-2222-2222-222222222222"

DESK_OUT="$(mktemp)"
SPEAKERS_OUT="$(mktemp)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$DESK_OUT" "$SPEAKERS_OUT"
}
trap cleanup EXIT

echo "== starting $IMAGE as $CONTAINER =="
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD="$PGPASS" "$IMAGE" >/dev/null

echo "== waiting for postgres to accept connections =="
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
  echo "postgres never became ready" >&2
  exit 1
fi

psql_container() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

echo "== applying local-supabase-stub.sql =="
psql_container -f - <"$SCRIPT_DIR/local-supabase-stub.sql"

echo "== applying #9 migration (players) =="
psql_container -f - <"$REPO_ROOT/supabase/migrations/20260924000000_players.sql"

echo "== applying #27 migration (saved progress) =="
psql_container -f - <"$REPO_ROOT/supabase/migrations/20260924010000_saved_progress.sql"

echo "== re-applying #27 migration a second time (must rerun cleanly) =="
psql_container -f - <"$REPO_ROOT/supabase/migrations/20260924010000_saved_progress.sql"

echo "== seeding the fixture Player and a second Player (B) =="
psql_container <<SQL
insert into auth.users (id, email) values
  ('$FIXTURE_ID', 'fixture-player@example.invalid'),
  ('$PLAYER_B_ID', 'player-b@example.invalid');
insert into public.players (id) values ('$FIXTURE_ID'), ('$PLAYER_B_ID');
SQL

echo "== running 27_rls_proof.sql as-is =="
RLS_OUTPUT="$(psql_container -f - <"$SCRIPT_DIR/27_rls_proof.sql")"
echo "$RLS_OUTPUT"

if ! grep -qE '^[[:space:]]*ALL[[:space:]]*\|[[:space:]]*t[[:space:]]*\|' <<<"$RLS_OUTPUT"; then
  echo "RLS proof FAILED: the ALL row did not report pass = t" >&2
  exit 1
fi
echo "== RLS proof: ALL row reports pass = t =="

echo "== resetting the fixture to 100 Tokens with no items, for the parallel-purchase check =="
psql_container <<SQL
delete from public.igloo_slots where player_id = '$FIXTURE_ID';
delete from public.player_items where player_id = '$FIXTURE_ID';
update public.players set tokens = 100 where id = '$FIXTURE_ID';
SQL

# Each session impersonates the fixture, buys one item (desk 80, speakers
# 100), then sleeps 2s before committing so both purchases are in flight at
# once. Each item alone fits the 100-Token balance; together they do not, so
# purchase_item()'s row lock must let only one succeed.
session_sql() {
  local item="$1"
  cat <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$FIXTURE_ID","role":"authenticated"}', true);
select public.purchase_item('$item');
select pg_sleep(2);
commit;
SQL
}

echo "== launching two parallel purchases: desk (80) and speakers (100) =="
psql_container -f - <<<"$(session_sql desk)" >"$DESK_OUT" 2>&1 &
PID_DESK=$!
psql_container -f - <<<"$(session_sql speakers)" >"$SPEAKERS_OUT" 2>&1 &
PID_SPEAKERS=$!

DESK_EXIT=0
wait "$PID_DESK" || DESK_EXIT=$?
SPEAKERS_EXIT=0
wait "$PID_SPEAKERS" || SPEAKERS_EXIT=$?

echo "---- desk session output (exit $DESK_EXIT) ----"
cat "$DESK_OUT"
echo "---- speakers session output (exit $SPEAKERS_EXIT) ----"
cat "$SPEAKERS_OUT"

PARALLEL_PASS=true

if [ "$DESK_EXIT" -eq 0 ] && [ "$SPEAKERS_EXIT" -eq 0 ]; then
  echo "FAIL: both parallel purchases succeeded" >&2
  PARALLEL_PASS=false
elif [ "$DESK_EXIT" -ne 0 ] && [ "$SPEAKERS_EXIT" -ne 0 ]; then
  echo "FAIL: both parallel purchases failed" >&2
  PARALLEL_PASS=false
else
  if [ "$DESK_EXIT" -ne 0 ]; then
    LOSER_OUT="$DESK_OUT"
  else
    LOSER_OUT="$SPEAKERS_OUT"
  fi
  if ! grep -q 'insufficient_tokens' "$LOSER_OUT"; then
    echo "FAIL: the losing purchase did not fail with insufficient_tokens" >&2
    PARALLEL_PASS=false
  fi
fi

FINAL_TOKENS="$(psql_container -t -A -c "select tokens from public.players where id = '$FIXTURE_ID';")"
FINAL_ITEM_COUNT="$(psql_container -t -A -c "select count(*) from public.player_items where player_id = '$FIXTURE_ID';")"
FINAL_ITEM="$(psql_container -t -A -c "select item_id from public.player_items where player_id = '$FIXTURE_ID' limit 1;")"

echo "== final state: tokens=$FINAL_TOKENS owned_items=$FINAL_ITEM_COUNT ($FINAL_ITEM) =="

if [ "$FINAL_ITEM_COUNT" != "1" ]; then
  echo "FAIL: expected exactly 1 owned item, got $FINAL_ITEM_COUNT" >&2
  PARALLEL_PASS=false
fi

case "$FINAL_ITEM" in
  desk) EXPECTED_TOKENS=20 ;;
  speakers) EXPECTED_TOKENS=0 ;;
  *)
    echo "FAIL: unexpected owned item '$FINAL_ITEM'" >&2
    PARALLEL_PASS=false
    EXPECTED_TOKENS=""
    ;;
esac

if [ -n "$EXPECTED_TOKENS" ] && [ "$FINAL_TOKENS" != "$EXPECTED_TOKENS" ]; then
  echo "FAIL: expected balance $EXPECTED_TOKENS, got $FINAL_TOKENS" >&2
  PARALLEL_PASS=false
fi

if [ "$PARALLEL_PASS" != true ]; then
  echo "Parallel purchase check FAILED" >&2
  exit 1
fi

echo "== parallel purchase check PASSED: exactly one purchase succeeded, balance matches, one item owned =="
echo "== all #27 proofs PASSED =="
