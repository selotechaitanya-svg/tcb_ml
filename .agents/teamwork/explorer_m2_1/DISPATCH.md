# Dispatch: Milestone 2 Explorer 1 - Incident Data Model, Validation & Scoping (explorer_m2_1)

## Target Workspace
`C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`

## Working Directory
`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_1`

## Mandatory Reference Documents (Read First)
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\PROJECT.md`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier1_feature_coverage.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\tests\e2e\tier2_boundary_corner.test.js`
- `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\schema.sql`

## Exploration Objectives
1. Design the Incident data access and service layer for creation and retrieval:
   - `POST /api/incidents`: Citizen only (`requireRole('Citizen')`).
   - Fields: `title` (non-empty string), `description` (non-empty string), `category` (valid category, e.g. Crime, Fire, Medical, Rescue, Other), `severity` (integer 1–5), `location` (non-empty string).
   - Validations: Return HTTP 400 Bad Request on missing fields, empty strings, invalid category, or severity outside 1–5.
   - Status initialized to `'Reported'`.
   - Automatic creation of initial `status_history` audit record (`previous_status = NULL`, `new_status = 'Reported'`, `changed_by_user_id = citizenId`).
2. Design listing and retrieval with strict role-based visibility:
   - `GET /api/incidents`:
     - Citizen: MUST ONLY view incidents they reported (`reporter_id = req.user.id`). Never expose other citizens' incidents.
     - Hero: Views all open (`Reported`) incidents by default.
   - `GET /api/incidents/:id`:
     - Returns full incident object along with its complete chronological `status_history` array.
     - For Citizen: If incident's `reporter_id !== req.user.id`, return HTTP 403 Forbidden or 404 Not Found.
     - For Hero: Can view any incident and its history.
3. Inspect the existing E2E tests (`tests/e2e/tier1_feature_coverage.test.js` and `tests/e2e/tier2_boundary_corner.test.js`) to ensure exact API route, query parameter, and JSON response shape consistency.
4. Output your detailed design and concrete implementation plan in `handoff.md` in your working directory.
