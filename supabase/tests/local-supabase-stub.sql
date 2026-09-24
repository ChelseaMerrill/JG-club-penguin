-- Stand-in for what Supabase itself provides, run before the #9 and #27
-- migrations on a plain postgres:17 image so both can be proved locally.
--
-- Not part of the deployed schema and never applied to real Supabase: real
-- Supabase already has the `anon` / `authenticated` roles, the `auth` schema
-- and `auth.uid()`. Local proofs (`run-local.sh`) apply this first; the human
-- gate on real Supabase never touches this file.
--
-- The SQL editor's role on real Supabase is the `postgres` superuser, so this
-- script (and everything after it) runs as `postgres` here too.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- Real Supabase's auth.users has many more columns; the migrations under
-- proof only need id and email.
create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Defined exactly as Supabase defines it, so RLS policies and
-- security-definer functions that call auth.uid() behave the same here as
-- on real Supabase.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated;
