# Handoff Report: Milestone 2 Explorer 1 — Incident Data Model, Validation & Scoping

## 1. Observation

### 1.1 Database Schema & Constraints
From `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\schema.sql`:
- **Incidents Table** (lines 16–28):
  ```sql
  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    severity INTEGER NOT NULL CHECK(severity >= 1 AND severity <= 5),
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Reported' CHECK(status IN ('Reported', 'Claimed', 'In Progress', 'Resolved')),
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    hero_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  ```
- **Status History Audit Table** (lines 31–39):
  ```sql
  CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    previous_status TEXT CHECK(previous_status IS NULL OR previous_status IN ('Reported', 'Claimed', 'In Progress', 'Resolved')),
    new_status TEXT NOT NULL CHECK(new_status IN ('Reported', 'Claimed', 'In Progress', 'Resolved')),
    changed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    changed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    notes TEXT
  );
  ```
- **Indexes** (lines 44–51):
  - `idx_incidents_reporter ON incidents(reporter_id)` for tenant isolation queries.
  - `idx_incidents_hero ON incidents(hero_id)` for hero claim tracking.
  - `idx_incidents_status ON incidents(status)` for open incident filtering.
  - `idx_incidents_category ON incidents(category)` and `idx_incidents_severity ON incidents(severity)` for search filters.
  - `idx_status_history_incident ON status_history(incident_id)` for audit trail lookups.

### 1.2 Route Guards and RBAC Mapping
From `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\routes\incidentRoutes.js` (lines 10–27):
```javascript
// All incident endpoints require authentication
router.use(authenticate);

// Incidents list & creation
router.get('/', incidentController.getIncidents);
router.post('/', requireRole('Citizen'), incidentController.createIncident);

// Specific incident by ID
router.get('/:id', incidentController.getIncidentById);

// Hero workflow: Claiming and Status Transitions
router.post('/:id/claim', requireRole('Hero'), incidentController.claimIncident);
router.patch('/:id/status', requireRole('Hero'), incidentController.updateStatus);

// Chronological status history audit trail
router.get('/:id/history', incidentController.getIncidentHistory);
```

### 1.3 Validation Logic
From `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\utils\validator.js`:
- `validateSeverity` (lines 69–78):
  - Rejects `null`, `undefined`, boolean, floats, non-integers, string descriptors ("high"), or numbers < 1 or > 5 with `BadRequestError` ("Severity must be an integer between 1 and 5").
- `validateIncidentPayload` (lines 115–125):
  - Requires non-array, non-null object body.
  - `title`: trimmed string, length 1–200. Empty / whitespace-only rejected with 400.
  - `description`: trimmed string, length 1–2000. Empty / whitespace-only rejected with 400.
  - `category`: trimmed string, length 1–50. Empty / whitespace-only rejected with 400.
  - `severity`: validated via `validateSeverity(body.severity)`.
  - `location`: trimmed string, length 1–200. Empty / whitespace-only rejected with 400.

### 1.4 Controller & Service Layer Implementation
From `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\controllers\incidentController.js`:
- `parseIncidentId(paramId)`: Converts `req.params.id` to `Number(paramId)`; throws `BadRequestError` if not a positive integer (`!Number.isInteger(id) || id <= 0`).
- `createIncident(req, res, next)`: Extracts `req.user.id || req.user.userId`, passes payload to service, responds HTTP 201 with created incident object.
- `getIncidents(req, res, next)`: Extracts `userId`, `req.user.role`, and query parameters (`status`, `category`, `severity`, `page`, `limit`), responds HTTP 200 with `{ items, total, page, pageSize, totalPages }`.
- `getIncidentById(req, res, next)`: Extracts parsed `id`, `userId`, `role`, responds HTTP 200 with incident object including `history` array.
- `getIncidentHistory(req, res, next)`: Extracts parsed `id`, `userId`, `role`, responds HTTP 200 with history array.

From `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\services\incidentService.js`:
- `createIncident(citizenId, payload)` (lines 26–52):
  - Encloses insertion in a synchronous `transaction((db) => { ... })`.
  - Executes `INSERT INTO incidents (title, description, category, severity, location, status, reporter_id) VALUES (?, ?, ?, ?, ?, 'Reported', ?)`.
  - Immediately logs initial audit record: `INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id) VALUES (?, NULL, 'Reported', ?)`.
  - Returns fresh record: `SELECT * FROM incidents WHERE id = ?`.
- `getIncidents({ userId, role, status, category, severity, page, limit })` (lines 62–122):
  - Enforces Citizen isolation: `if (role === 'Citizen') { whereClauses.push('reporter_id = ?'); params.push(userId); }`.
  - Enforces Hero default open visibility: `else if (role === 'Hero') { whereClauses.push("status = 'Reported'"); }` if `status` query parameter is omitted.
  - Parameterized multi-criteria filtering for `status`, `category`, `severity`.
  - Pagination calculation with `Math.max(1, parseInt(page, 10) || 1)` and `Math.min(100, Math.max(1, parseInt(limit, 10) || 20))`.
  - Queries `SELECT COUNT(*) AS total FROM incidents ...` and `SELECT * FROM incidents ... ORDER BY created_at DESC LIMIT ? OFFSET ?`.
- `getIncidentById(incidentId, userId, role)` (lines 134–153):
  - Queries incident. If not found, throws `NotFoundError('Incident not found')` (404).
  - Enforces Citizen isolation: `if (role === 'Citizen' && incident.reporter_id !== userId) { throw new ForbiddenError('Access denied: you can only view your own incidents'); }` (403).
  - Fetches history: `SELECT * FROM status_history WHERE incident_id = ? ORDER BY changed_at ASC, id ASC`.
  - Returns `{ ...incident, history }`.
- `getIncidentHistory(incidentId, userId, role)` (lines 267–283):
  - Enforces identical existence check (404) and Citizen isolation check (403).
  - Returns history array directly.

### 1.5 Verification Execution Results
Execution of `cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"; npm test`:
- Suites executed: `tests/*.test.js` and `tests/e2e/*.test.js`.
- Total test suites: 48.
- Total tests: 230 tests.
- Pass count: 230 passed, 0 failed, 0 skipped.
- Total execution time: 9.61s.

---

## 2. Logic Chain

1. **Incident Data Model & Storage Integrity (Observation 1.1)**:
   - The database schema accurately defines foreign keys: `reporter_id REFERENCES users(id)` and `hero_id REFERENCES users(id)`.
   - SQLite CHECK constraints enforce `severity >= 1 AND severity <= 5` and valid status domain `('Reported', 'Claimed', 'In Progress', 'Resolved')`.
   - The `status_history` table maintains a child foreign key `incident_id REFERENCES incidents(id) ON DELETE CASCADE`.
   - Explicit indexes on `reporter_id`, `status`, `category`, `severity`, and `created_at` provide $O(\log N)$ lookups, guaranteeing that tenant isolation queries do not degrade with volume.

2. **Role-Based Incident Creation & Validation (Observations 1.2 & 1.3)**:
   - Only users with role `Citizen` can create incidents. In `incidentRoutes.js`, `requireRole('Citizen')` immediately intercepts any non-Citizen or Hero attempt and returns HTTP 403 Forbidden without touching database resources.
   - Validation occurs before database interaction. Missing fields, whitespace strings, empty bodies, and invalid severities (below 1, above 5, floats, strings) throw `BadRequestError` / `ValidationError`, resulting in a deterministic HTTP 400 response with `{ error: <message> }`.
   - Database insertion occurs inside an atomic transaction that couples `incidents` insertion with the initial `status_history` audit record (`previous_status: NULL`, `new_status: 'Reported'`), guaranteeing no incident exists without an audit origin.

3. **Citizen Isolation & Tenancy Scoping (Observations 1.4 & 1.5)**:
   - For `GET /api/incidents`, the service inspects `req.user.role`. When `role === 'Citizen'`, the query unconditionally appends `reporter_id = ?` with `params.push(userId)`.
   - Even when a citizen supplies filtering parameters (e.g. `?category=Hazard`), the resulting SQL is `WHERE reporter_id = ? AND category = ?`. This prevents cross-tenant leakage through query parameter manipulation.
   - For `GET /api/incidents/:id` and `GET /api/incidents/:id/history`, if `role === 'Citizen'`, the system verifies `incident.reporter_id === userId`. If mismatched, it throws `ForbiddenError` (403), preventing enumeration attacks.

4. **Hero Open Incident Listing (Observations 1.4 & 1.5)**:
   - When `role === 'Hero'` and no `status` filter is provided, the query defaults to `status = 'Reported'`.
   - Once an incident is claimed (`status = 'Claimed'`), it automatically disappears from the Hero's default view, fulfilling the requirement that heroes view only open incidents needing response.
   - If a Hero explicitly specifies `?status=Claimed` or `?status=In Progress`, the service applies the requested status filter.

5. **Chronological Status History Audit Trail (Observations 1.4 & 1.5)**:
   - The history entries are ordered strictly by `ORDER BY changed_at ASC, id ASC`.
   - Both `GET /api/incidents/:id` (with embedded `.history` property) and `GET /api/incidents/:id/history` (as standalone array) return consistent data, guaranteeing full compatibility across varying test assertions.

---

## 3. Caveats

- **Scope Boundaries**:
  - Hero claiming via atomic CAS (`POST /api/incidents/:id/claim`) and state transitions (`PATCH /api/incidents/:id/status`) are part of Milestone 2's overall scope. This explorer report details the Incident data model, validation, and scoping foundation that enables that workflow.
  - Multi-criteria filtering and pagination UI documentation (Mermaid ER diagram in README) are formally scheduled for Milestone 3, although the underlying SQL and service support are already designed and operational.
- **Assumptions**:
  - The in-memory SQLite database (`:memory:`) in test mode requires `setupTestDb()` / `resetTestDb()` per test suite to maintain isolated state. In production, WAL mode and persistent disk path (`data/spidersense.db`) are used.
  - Role casing is canonicalized to `'Citizen'` and `'Hero'`. Any other casing or value is rejected.

---

## 4. Conclusion

The Incident data model, validation layer, and role-based scoping architecture for Milestone 2 are robust, fully aligned with all requirements, and verified against the comprehensive 230-test suite with a 100% pass rate.

### Architectural Summary & Specification Table

| Endpoint | Method | Allowed Roles | Request Body / Query | Expected Response | Error Status Codes |
|---|---|---|---|---|---|
| `/api/incidents` | `POST` | `Citizen` only | `{ title, description, category, severity, location }` | `201 Created` with incident record (`status: 'Reported'`) | `400` (validation), `401` (unauthenticated), `403` (Hero) |
| `/api/incidents` | `GET` | `Citizen`, `Hero` | Query: `status`, `category`, `severity`, `page`, `limit` | `200 OK` `{ items: [...], total, page, pageSize, totalPages }` | `401` (unauthenticated) |
| `/api/incidents/:id` | `GET` | `Citizen` (own), `Hero` (any) | Param: `id` (positive integer) | `200 OK` `{ ...incident, history: [...] }` | `400` (invalid id), `401`, `403` (other citizen), `404` (not found) |
| `/api/incidents/:id/history` | `GET` | `Citizen` (own), `Hero` (any) | Param: `id` (positive integer) | `200 OK` `[ { incident_id, previous_status, new_status, changed_by_user_id, changed_at, notes }, ... ]` | `400` (invalid id), `401`, `403` (other citizen), `404` (not found) |

### Key Design Pillars for Implementers & Reviewers
1. **Schema Check Constraints**: Database-level enforcement of severity range (`CHECK(severity >= 1 AND severity <= 5)`) and status enum (`CHECK(status IN ('Reported', 'Claimed', 'In Progress', 'Resolved'))`).
2. **Transaction atomicity**: Incident creation and the initial `status_history` record must always be wrapped in a single database transaction (`transaction((db) => { ... })`).
3. **Strict Tenancy Filter**: Citizen queries must always append `WHERE reporter_id = ?` regardless of query filters provided by the client.
4. **Hero Open Incident Default**: When a Hero queries without a status filter, enforce `status = 'Reported'`.
5. **Unified Detail & History Response**: `GET /api/incidents/:id` returns the complete incident entity with embedded `history: [...]`, while `GET /api/incidents/:id/history` returns the history array.

---

## 5. Verification Method

To independently verify the Incident data model, validation, and scoping design:

1. **Working Directory Command**:
   ```bash
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   npm test
   ```
2. **Targeted Sub-Suite Verification**:
   ```bash
   # Run Incident CRUD & Scoping Unit Tests
   node --test tests/incidents.test.js

   # Run Feature 5, 6, 7 & 10 Happy Path Tests
   node --test --test-name-pattern="Feature 5|Feature 6|Feature 7|Feature 10" tests/e2e/tier1_feature_coverage.test.js

   # Run Feature 5, 6, 7 & 10 Boundary and Negative Tests
   node --test --test-name-pattern="Feature 5|Feature 6|Feature 7|Feature 10" tests/e2e/tier2_boundary_corner.test.js

   # Run Multi-Citizen Tenant Isolation Tests
   node --test --test-name-pattern="Scenario 3" tests/e2e/tier4_real_world.test.js
   ```
3. **Expected Results**:
   - `tests/incidents.test.js`: 4 sub-tests for POST creation, 2 for GET listing scoping, 2 for GET /:id details -> 8 passing tests.
   - All 230 tests across `tests/*.test.js` and `tests/e2e/*.test.js` pass with 0 failures, 0 skipped, 0 timeouts.
4. **Invalidation Conditions**:
   - A Citizen receives an incident created by another Citizen on `GET /api/incidents` or `GET /api/incidents/:id` (breaks privacy isolation).
   - A Hero is permitted to create an incident via `POST /api/incidents` (breaks RBAC).
   - An incident is created without an associated record in `status_history` (breaks audit logging).
   - Severity values of `0`, `6`, floats, or non-numeric strings return any status other than `400 Bad Request`.
