# #27 saved-progress proofs

## Local (Docker)

```
bash supabase/tests/run-local.sh
```

Needs Docker running locally. It starts a throwaway `postgres:17` container,
applies `local-supabase-stub.sql` (a stand-in for what Supabase itself
provides) and both migrations, reruns the saved-progress migration a second
time to prove it stays idempotent, runs `27_rls_proof.sql` as-is, and then
runs a live two-session parallel-purchase race that only a real database can
prove. It removes the container on exit and exits non-zero on any failure.

## Real Supabase (gate H2)

1. Open the Supabase SQL editor for this project, signed in as the project
   owner (same process as #9's H1).
2. Open `27_rls_proof.sql`, replace every occurrence of
   `00000000-0000-0000-0000-00000000f1f0` with the real #9 H1 fixture
   Player's id, and run it.
3. Expect every row's `pass` column to read `true`, including the final
   `ALL` row. It changes nothing: the proof rolls back everything it wrote
   before returning.
4. Paste the output table on #27.

Do not name real emails or Player ids anywhere the output gets pasted;
`27_rls_proof.sql` never selects or prints them itself.
