# Dispatch: Milestone 1 Iteration 2 Implementation

## Target Workspace
`C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`

## Working Directory
`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\worker_m1_r2`

## Mandatory Reference Documents (Read First)
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\schema.patch`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_2\database_transaction_guard.patch`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_3\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Assigned Tasks
1. Ground on target files in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
   - `src/db/schema.sql`
   - `src/db/database.js`
2. Apply `COLLATE NOCASE` fix to `src/db/schema.sql`:
   - In `CREATE TABLE IF NOT EXISTS users`:
     - `username TEXT NOT NULL UNIQUE COLLATE NOCASE,`
     - `email TEXT NOT NULL UNIQUE COLLATE NOCASE,`
   - In indexes:
     - `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);`
     - `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);`
3. Apply transaction async guard fix to `src/db/database.js`:
   - Prevent unhandled promise rejections on async transaction callbacks.
   - Guard against thenable return values, roll back transaction immediately, and throw explicit Error requiring synchronous transactions.
4. Run unit and adversarial verification:
   - Execute `npm run test:unit` in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`.
   - Confirm that all 82 tests pass across `auth.test.js`, `adversarial_m1.test.js`, and `adversarial_m1_2.test.js` with exit code 0.
5. Produce `handoff.md` in your working directory documenting exact modifications, test output, and verification commands.


## 2026-10-29T20:50:32Z
Received dispatch message:
You are worker_m1_r2, a teamwork_worker implementing fixes for Milestone 1 Iteration 2.
Tasks:
1. Ground on target files in C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back:
   - src/db/schema.sql
   - src/db/database.js
2. Apply COLLATE NOCASE to users.username and users.email in src/db/schema.sql (table and indexes) per schema.patch.
3. Apply transaction async guard to src/db/database.js per database_transaction_guard.patch.
4. Execute `npm run test:unit` in C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back to verify all 82 tests pass across auth.test.js, adversarial_m1.test.js, and adversarial_m1_2.test.js.
5. Write your complete handoff report to:
   c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\worker_m1_r2\handoff.md
6. Send a message to your orchestrator when complete.
