# Dispatch: Milestone 2 Explorer 2 - Atomic CAS Claiming & Concurrency (explorer_m2_2)

## Target Workspace
`C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`

## Working Directory
`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_2`

## Mandatory Reference Documents (Read First)
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier4_real_world.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\schema.sql`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\database.js`

## Exploration Objectives
1. Design the Atomic Claiming endpoint:
   - `POST /api/incidents/:id/claim`: Hero only (`requireRole('Hero')`).
   - Must use an atomic SQL Compare-and-Swap (CAS) update:
     `UPDATE incidents SET status = 'Claimed', hero_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Reported'`
   - Concurrency semantics:
     - Check `changes === 1`:
       - If 1: Winner of the claim race. Insert audit record in `status_history` (`previous_status = 'Reported'`, `new_status = 'Claimed'`, `changed_by_user_id = heroId`). Return HTTP 200 with updated incident.
       - If 0: Loser of the race or invalid state. Query incident:
         - If incident does not exist: return HTTP 404 Not Found.
         - If incident exists and `status !== 'Reported'`: return HTTP 409 Conflict.
2. Examine concurrency behavior with `node:sqlite` in WAL mode and `:memory:`:
   - Verify how `Promise.all` multi-hero concurrent requests behave in Node.js event loop with synchronous SQLite statements.
   - Ensure the transaction/CAS execution prevents any dirty reads or double claims. Exactly one hero must get 200, and rival hero(es) must get 409 Conflict.
3. Inspect `tests/e2e/tier4_real_world.test.js` (Scenario 2: Multi-Hero Claim Race Condition) and `tests/e2e/tier1_feature_coverage.test.js` to align with expected request/response contracts.
4. Output your detailed design and concrete implementation plan in `handoff.md` in your working directory.


## 2026-10-29T21:03:43Z
You are explorer_m2_2, a teamwork_explorer designing the Atomic Compare-and-Swap Claiming and Concurrency mechanism for Milestone 2.

Your working directory is:
c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_2

Read your dispatch file and mandatory reference documents:
- c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_2\DISPATCH.md
- c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier4_real_world.test.js
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\schema.sql
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\database.js

Explore and design:
1. `POST /api/incidents/:id/claim` (Hero only).
2. Atomic SQL Compare-and-Swap (CAS) update pattern with node:sqlite:
   `UPDATE incidents SET status = 'Claimed', hero_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Reported'`
3. Concurrency guarantees: winner gets 200, loser gets 409 Conflict.
4. Status history insertion for claim event.
5. Alignment with E2E test assertions in tier4_real_world.test.js.

Write your complete design and implementation plan to handoff.md in your working directory, then send a completion message to the orchestrator.
