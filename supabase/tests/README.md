# #27 saved-progress proofs

## Local (Docker)

Requires Docker running locally and `openssl` on `PATH` (used to generate the
throwaway container password). `run-local.sh` checks for both up front and
fails fast with a clear message if either is missing.

```
bash supabase/tests/run-local.sh
```

It starts a throwaway `postgres:17` container (fixed name `jgcp-27-pg`, force-
removed on exit whether the run passes or fails), applies
`local-supabase-stub.sql` (a stand-in for what Supabase itself provides) and
both migrations, reruns the saved-progress migration a second time to prove
it stays idempotent, runs `27_rls_proof.sql` as-is, and then runs a live
two-session parallel-purchase race that only a real database can prove. It
exits non-zero on any failure.

The complete output (every command's stdout and stderr) is teed to
`test-results/27-saved-progress-local/output.txt`, relative to the repo
root. That file is the evidence for a passing local run; it is gitignored,
not committed.

## Real Supabase (gate H2)

1. Open the Supabase SQL editor for this project, signed in as the project
   owner (same process as #9's H1).
2. Open `27_rls_proof.sql`, replace every occurrence of
   `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it.
3. Expect every row's `pass` column to read `true`, including the final
   `ALL` row. It changes nothing: the proof rolls back everything it wrote
   before returning.
4. Save the result table, with ids and emails removed, to
   `test-results/27-rls-proof-supabase/output.txt`, and paste the same
   table on #27.

Do not name real emails or Player ids anywhere the output gets saved or
pasted; `27_rls_proof.sql` never selects or prints them itself.
