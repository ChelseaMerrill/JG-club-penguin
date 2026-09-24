import { describeProgressStoreContract } from './progress-store.contract';
import { createPgliteProgressStoreHarness } from './testing/pglite-progress-store';

// Runs the same contract suite as the in-memory fake, against a real
// Postgres database (PGlite) migrated from #27's `saved_progress.sql`, so a
// rule change to the migration or the fake shows up here as a shared
// failure instead of silent drift between them.
describeProgressStoreContract('SQL ProgressStore (PGlite)', createPgliteProgressStoreHarness);
