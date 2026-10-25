#!/usr/bin/env bash
# Runs every supabase/tests/*_proof.sql against a running local Supabase
# (`supabase start` + `supabase db reset`). Each proof prints rows shaped
# check_name|pass|detail and ends with a check_name `ALL` row. The run fails
# unless every proof prints rows, includes an `ALL` row, and every row's pass
# field is exactly `t`.
#
# Local Supabase only: it inserts a fixture Player into auth.users and
# public.players, so it refuses any DATABASE_URL host other than 127.0.0.1 or
# localhost. Never point it at the production project. DATABASE_URL defaults
# to the local Supabase Postgres. Requires psql.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
# Glob override exists only so a negative check can point at scratch proofs.
PROOF_GLOB="${PROOF_GLOB:-$SCRIPT_DIR/*_proof.sql}"

case "$DATABASE_URL" in
  *@127.0.0.1:* | *@127.0.0.1/* | *@localhost:* | *@localhost/*) ;;
  *)
    echo "run-proofs.sh only runs against local Supabase (127.0.0.1 or localhost); refusing DATABASE_URL with another host." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "run-proofs.sh requires 'psql' on PATH; install the PostgreSQL client and retry." >&2
  exit 1
fi

# Evidence policy: captured output cited as PASS evidence is saved under
# test-results/ (gitignored, local only). Tee everything (stdout and stderr) to
# that file as well as the terminal, from here to the end of the script.
OUTPUT_DIR="$REPO_ROOT/test-results/supabase-proofs"
mkdir -p "$OUTPUT_DIR"
exec > >(tee "$OUTPUT_DIR/output.txt") 2>&1

FIXTURE_ID='00000000-0000-0000-0000-00000000f1f0'
echo "Seeding fixture Player $FIXTURE_ID"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id, email) values ('$FIXTURE_ID', 'fixture-player@example.invalid') on conflict (id) do nothing;
insert into public.players (id) values ('$FIXTURE_ID') on conflict (id) do nothing;
SQL

passed=0
total=0
failed=0
# A while-read loop rather than mapfile, so macOS's bash 3.2 can run this too.
files=()
while IFS= read -r f; do
  files+=("$f")
done < <(compgen -G "$PROOF_GLOB" | sort || true)
if [ "${#files[@]}" -eq 0 ]; then
  echo "FAIL: no proof files match $PROOF_GLOB" >&2
  exit 1
fi

for file in "${files[@]}"; do
  total=$((total + 1))
  name="$(basename "$file")"
  echo "== $name =="
  errfile="$(mktemp)"
  set +e
  out="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -t -F '|' -f "$file" 2>"$errfile")"
  status=$?
  set -e
  printf '%s\n' "$out"
  cat "$errfile"
  rm -f "$errfile"

  if [ "$status" -ne 0 ]; then
    echo "FAIL: $name: psql exited $status" >&2
    failed=$((failed + 1))
    continue
  fi

  rows="$(printf '%s\n' "$out" | grep -c '|' || true)"
  if [ "$rows" -eq 0 ]; then
    echo "FAIL: $name: proof produced zero rows" >&2
    failed=$((failed + 1))
    continue
  fi

  if ! printf '%s\n' "$out" | awk -F'|' '$1 == "ALL" && NF >= 3 { found = 1 } END { exit !found }'; then
    echo "FAIL: $name: no check_name|pass|detail row named ALL" >&2
    failed=$((failed + 1))
    continue
  fi

  bad="$(printf '%s\n' "$out" | awk -F'|' 'NF >= 2 && $2 != "t"' || true)"
  if [ -n "$bad" ]; then
    echo "FAIL: $name: failing rows:" >&2
    printf '%s\n' "$bad" >&2
    failed=$((failed + 1))
    continue
  fi

  passed=$((passed + 1))
done

echo "Proofs passed: $passed of $total"
if [ "$failed" -ne 0 ]; then
  echo "FAIL: $failed proof(s) failed" >&2
  exit 1
fi
