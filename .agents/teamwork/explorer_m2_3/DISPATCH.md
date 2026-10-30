# Dispatch: Milestone 2 Explorer 3 - Incident State Machine & Routing Architecture (explorer_m2_3)

## Target Workspace
`C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`

## Working Directory
`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_3`

## Mandatory Reference Documents (Read First)
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier1_feature_coverage.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier2_boundary_corner.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier4_real_world.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\app.js`

## Exploration Objectives
1. Design the Incident Status Transition endpoint and state machine:
   - `PATCH /api/incidents/:id/status`: Hero only (`requireRole('Hero')`).
   - Request body: `{ status: 'In Progress' | 'Resolved', notes?: string }`.
   - Ownership check: Only the hero who claimed the incident (`hero_id === req.user.id`) can update its status. If another hero attempts to transition the status, return HTTP 403 Forbidden.
   - Strict State Machine flow:
     - `Reported` -> `Claimed` (handled via claim endpoint)
     - `Claimed` -> `In Progress`
     - `In Progress` -> `Resolved`
   - Invalid jumps rejection:
     - Attempting `Reported` -> `In Progress` or `Reported` -> `Resolved`: return HTTP 400 Bad Request.
     - Attempting `Claimed` -> `Resolved` (skipping `In Progress`): return HTTP 400 Bad Request.
     - Attempting backwards transitions (e.g. `Resolved` -> `In Progress` or `In Progress` -> `Claimed`): return HTTP 400 Bad Request.
     - Invalid status strings: return HTTP 400 Bad Request.
   - On valid transition:
     - Update `incidents` (`status`, `updated_at`).
     - Insert audit record into `status_history` (`incident_id`, `previous_status`, `new_status`, `changed_by_user_id`, `notes`).
     - Return HTTP 200 with updated incident object.
2. Design the Express Routing and Controller architecture:
   - `src/controllers/incidentController.js`
   - `src/routes/incidentRoutes.js`
   - Wiring into `src/app.js` (`app.use('/api/incidents', incidentRoutes);`).
3. Formulate the test strategy for unit tests (`tests/incidents.test.js`, `tests/lifecycle.test.js`, `tests/concurrency.test.js`).
4. Output your detailed design and concrete implementation plan in `handoff.md` in your working directory.


## 2026-10-29T21:03:50Z
You are explorer_m2_3, a teamwork_explorer designing the Incident State Machine, Status Transitions, Ownership Guards, and Routing Architecture for Milestone 2.

Your working directory is:
c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_3

Read your dispatch file and mandatory reference documents:
- c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier1_feature_coverage.test.js
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier2_boundary_corner.test.js
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier4_real_world.test.js
- C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\app.js

Explore and design:
1. `PATCH /api/incidents/:id/status` (Hero only).
2. Deterministic state machine: Reported -> Claimed -> In Progress -> Resolved.
3. Strict transition validation and 400 rejection on illegal transitions / backwards jumps.
4. Ownership guard: only assigned hero (`hero_id === req.user.id`) can update status (403 for others).
5. Audit trail: status history insertion with notes.
6. Express routes (`src/routes/incidentRoutes.js`), controller (`src/controllers/incidentController.js`), and wiring in `src/app.js`.
7. Unit testing suite plan for Milestone 2 (`tests/incidents.test.js`, `tests/lifecycle.test.js`, `tests/concurrency.test.js`).

Write your complete design and implementation plan to handoff.md in your working directory, then send a completion message to the orchestrator.
