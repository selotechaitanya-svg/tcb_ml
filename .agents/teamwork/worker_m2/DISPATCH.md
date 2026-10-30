# Dispatch: Milestone 2 Implementation Worker (worker_m2)

## Target Workspace
`C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`

## Working Directory
`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\worker_m2`

## Mandatory Reference Documents (Read First)
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_1\handoff.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_2\handoff.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_3\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Assigned Tasks
1. Ground on target files in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
   - `src/services/incidentService.js`
   - `src/controllers/incidentController.js`
   - `src/routes/incidentRoutes.js`
   - `src/utils/validator.js`
   - `src/app.js`
   - `tests/incidents.test.js`
   - `tests/lifecycle.test.js`
   - `tests/concurrency.test.js`
2. Verify that all Milestone 2 requirements and edge cases are completely satisfied:
   - Incident Creation & Validation (`POST /api/incidents`: Citizen only, severity 1–5, category check, initial `status_history` record).
   - Citizen Scoping (`GET /api/incidents`: Citizens see only their own incidents).
   - Hero Open Incident Visibility (`GET /api/incidents`: Heroes see open `Reported` incidents by default).
   - Incident Details & History (`GET /api/incidents/:id`: Full details + complete chronological `status_history` array, 403 on Citizen mismatch, 404 if not found).
   - Atomic CAS Claiming (`POST /api/incidents/:id/claim`: Hero only, atomic CAS `UPDATE incidents SET status = 'Claimed', hero_id = ? WHERE id = ? AND status = 'Reported'`, 200 for winner, 409 Conflict for loser / already claimed, audit log insertion).
   - Deterministic State Transitions (`PATCH /api/incidents/:id/status`: Strict linear transitions `Reported` -> `Claimed` -> `In Progress` -> `Resolved`, 400 on illegal jumps or invalid status).
   - Hero Claim Ownership (Only assigned hero can update status; 403 for others).
   - Status History Audit Logging (Every transition inserts into `status_history`).
3. Execute unit verification:
   - Run `node --test tests/incidents.test.js tests/lifecycle.test.js tests/concurrency.test.js`.
   - Run full unit suite: `npm run test:unit`.
   - Run full test suite: `npm test`.
4. Produce a detailed 5-component `handoff.md` in your working directory documenting implementation verification, test outputs, and exit codes.

## 2026-10-29T21:10:21Z
[Message] timestamp=2026-10-29T21:10:21Z sender=1f711568-1661-45be-898c-803cc58f3f36 priority=MESSAGE_PRIORITY_HIGH content=You are worker_m2, a teamwork_worker implementing and verifying Milestone 2 (Incident Lifecycle & Concurrency).
