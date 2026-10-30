# Milestone 2 Implementation & Verification Handoff Report

**Agent ID**: `worker_m2`  
**Milestone**: Milestone 2 — Incident Lifecycle & Concurrency  
**Target Workspace**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Date**: 2026-10-29T21:22:00Z  

---

## 1. Observation

Direct examination of the codebase and test execution in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back` yielded the following concrete observations:

### 1.1 Source Code Architecture & Implementations

1. **Incident Validation & Schema Enforcement (`src/utils/validator.js`)**:
   - Lines 69–78 (`validateSeverity`):
     ```javascript
     function validateSeverity(severity, fieldName = 'Severity') {
       if (severity === null || severity === undefined || typeof severity === 'boolean') {
         throw new BadRequestError(`${fieldName} must be an integer between 1 and 5`);
       }
       const num = Number(severity);
       if (!Number.isInteger(num) || num < 1 || num > 5) {
         throw new BadRequestError(`${fieldName} must be an integer between 1 and 5`);
       }
       return num;
     }
     ```
   - Lines 115–125 (`validateIncidentPayload`):
     Validates non-array object, validates `title` (1–200 chars), `description` (1–2000 chars), `category` (1–50 chars), `severity` (1–5 integer), and `location` (1–200 chars), throwing `BadRequestError` (HTTP 400) on violations.

2. **Incident Creation & Status History Initialization (`src/services/incidentService.js:26-52`)**:
   ```javascript
   createIncident(citizenId, payload) {
     const validated = validateIncidentPayload(payload);

     return transaction((db) => {
       const insertResult = db.run(
         `INSERT INTO incidents (title, description, category, severity, location, status, reporter_id)
          VALUES (?, ?, ?, ?, ?, 'Reported', ?)`,
         [validated.title, validated.description, validated.category, validated.severity, validated.location, citizenId]
       );

       const incidentId = Number(insertResult.lastInsertRowid);

       // Log initial status history: null -> Reported
       db.run(
         `INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id)
          VALUES (?, NULL, 'Reported', ?)`,
         [incidentId, citizenId]
       );

       const incident = db.get(
         'SELECT * FROM incidents WHERE id = ?',
         [incidentId]
       );

       return incident;
     });
   }
   ```
   Ensures atomic coupling of incident creation with initial audit log insertion inside `BEGIN IMMEDIATE` transaction.

3. **Citizen Scoping and Hero Default Open Visibility (`src/services/incidentService.js:62-122`)**:
   - Citizen Isolation: Lines 70–73:
     ```javascript
     if (role === 'Citizen') {
       whereClauses.push('reporter_id = ?');
       params.push(userId);
     }
     ```
   - Hero Open Incident Visibility: Lines 78–81:
     ```javascript
     else if (role === 'Hero') {
       // Heroes default to seeing only Reported (open) incidents
       whereClauses.push("status = 'Reported'");
     }
     ```
   - Incident by ID Scoping: Lines 134–153:
     ```javascript
     if (role === 'Citizen' && incident.reporter_id !== userId) {
       throw new ForbiddenError('Access denied: you can only view your own incidents');
     }
     ```
     Throws HTTP 403 Forbidden on citizen mismatch.

4. **Atomic Compare-and-Swap (CAS) Claiming (`src/services/incidentService.js:163-192`)**:
   ```javascript
   claimIncident(incidentId, heroId) {
     return transaction((db) => {
       // Atomic CAS: only succeeds if incident is still 'Reported'
       const result = db.run(
         `UPDATE incidents
          SET status = 'Claimed', hero_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'Reported'`,
         [heroId, incidentId]
       );

       if (result.changes === 0) {
         // Determine why: not found or already claimed
         const existing = db.get('SELECT id, status FROM incidents WHERE id = ?', [incidentId]);
         if (!existing) {
           throw new NotFoundError('Incident not found');
         }
         // Already claimed or past Reported status
         throw new ConflictError(`Incident cannot be claimed: current status is '${existing.status}'`);
       }

       // Log status history: Reported -> Claimed
       db.run(
         `INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id)
          VALUES (?, 'Reported', 'Claimed', ?)`,
         [incidentId, heroId]
       );

       return db.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
     });
   }
   ```
   Provides deterministic mutual exclusion during race conditions; winner receives updated incident (200), competitor receives 409 Conflict.

5. **Linear State Machine and Ownership Guards (`src/services/incidentService.js:12-16, 208-257`)**:
   ```javascript
   const VALID_TRANSITIONS = {
     'Claimed': ['In Progress'],
     'In Progress': ['Resolved']
   };
   ...
   if (incident.status === 'Reported') {
     throw new BadRequestError("Cannot update status of a Reported incident. Incident must be claimed first.");
   }

   // Only the assigned hero can update status
   if (incident.hero_id !== heroId) {
     throw new ForbiddenError('Access denied: only the assigned hero can update this incident');
   }

   // Validate state transition
   const allowedNext = VALID_TRANSITIONS[incident.status];
   if (!allowedNext || !allowedNext.includes(trimmedStatus)) {
     throw new BadRequestError(
       `Invalid status transition: '${incident.status}' -> '${trimmedStatus}'`
     );
   }
   ```
   Enforces:
   - `Reported` cannot be updated via status endpoint directly (must be claimed first, HTTP 400).
   - Only assigned hero (`incident.hero_id === heroId`) can update status (HTTP 403 on mismatch).
   - Illegal transitions (`Claimed` -> `Resolved`, `In Progress` -> `Reported`, terminal state updates) trigger HTTP 400.
   - Every valid transition updates status and inserts audit row into `status_history`.

6. **Route Guards (`src/routes/incidentRoutes.js:10-27`)**:
   - `router.use(authenticate)`: protects all endpoints (missing/invalid token returns HTTP 401).
   - `router.post('/', requireRole('Citizen'), incidentController.createIncident)`: Citizen only (Hero returns HTTP 403).
   - `router.post('/:id/claim', requireRole('Hero'), incidentController.claimIncident)`: Hero only (Citizen returns HTTP 403).
   - `router.patch('/:id/status', requireRole('Hero'), incidentController.updateStatus)`: Hero only (Citizen returns HTTP 403).

### 1.2 Syntax and Test Verification Outputs

1. **Syntax Integrity Check**:
   Command:
   `Get-ChildItem -Path src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }`
   Result: Exit code 0, 0 syntax errors across all files.

2. **Milestone 2 Targeted Test Execution**:
   Command:
   `node --test tests/incidents.test.js tests/lifecycle.test.js tests/concurrency.test.js`
   Output:
   ```
   ▶ Concurrency Control: Race Conditions on Incident Claiming
     ✔ should ensure exactly one hero claims an incident during concurrent claim race conditions (214.88ms)
     ✔ should reject claim on already Claimed incident with 409 Conflict (168.2129ms)
   ✔ Concurrency Control: Race Conditions on Incident Claiming (384.8996ms)
   ▶ Incident Management: CRUD & Access Scoping
     ▶ POST /api/incidents (Incident Creation)
       ✔ should allow a Citizen to create an incident with severity 1-5 and all required fields (91.2386ms)
       ✔ should reject incident creation by a Hero (403 Forbidden) (58.3207ms)
       ✔ should reject incident creation with missing required fields (400 Bad Request) (55.8422ms)
       ✔ should reject incident creation with invalid severity (e.g. 0, 6, "five") (400 Bad Request) (63.6708ms)
     ✔ POST /api/incidents (Incident Creation) (269.6667ms)
     ▶ GET /api/incidents (Listing & Scoping)
       ✔ should isolate Citizen views: citizens see only their own reported incidents (122.135ms)
       ✔ should allow Heroes to view all open (Reported) incidents across all citizens (108.35ms)
     ✔ GET /api/incidents (Listing & Scoping) (230.648ms)
     ▶ GET /api/incidents/:id (Individual Incident Details)
       ✔ should deny a citizen from viewing another citizen incident by ID (403 Forbidden) (103.7641ms)
       ✔ should return 404 Not Found for non-existent incident ID (53.0288ms)
     ✔ GET /api/incidents/:id (Individual Incident Details) (156.9492ms)
   ✔ Incident Management: CRUD & Access Scoping (658.9071ms)
   ▶ Incident Lifecycle & State Transitions
     ✔ should enforce the strict status flow: Reported -> Claimed -> In Progress -> Resolved (155.603ms)
     ✔ should reject invalid status jumps with 400 Bad Request (123.9349ms)
     ✔ should prevent an unassigned hero from updating or resolving another hero incident (403 Forbidden) (168.7719ms)
   ✔ Incident Lifecycle & State Transitions (450.4046ms)
   ℹ tests 13
   ℹ suites 6
   ℹ pass 13
   ℹ fail 0
   ℹ duration_ms 890.0934
   ```

3. **Full Unit Test Suite (`npm run test:unit`)**:
   Command: `npm run test:unit`
   Output:
   ```
   ℹ tests 101
   ℹ suites 22
   ℹ pass 101
   ℹ fail 0
   ℹ duration_ms 2365.0211
   ```

4. **Complete Test Suite (`npm test`)**:
   Command: `npm test`
   Output:
   ```
   ℹ tests 230
   ℹ suites 48
   ℹ pass 230
   ℹ fail 0
   ℹ duration_ms 2549.8758
   ```

---

## 2. Logic Chain

1. **Input Validation & Integrity (Observation 1.1.1 & 1.1.2)**:
   - Because `validateIncidentPayload` verifies that title, description, category, and location are non-empty trimmed strings and delegates severity check to `validateSeverity` (strictly integers in range [1, 5]), non-compliant inputs are caught and rejected with HTTP 400 before database queries are issued.
   - Observed tests in `tests/incidents.test.js` confirm that severities `0`, `6`, `-1`, `3.5`, and `'high'` consistently return HTTP 400.

2. **Auditing Atomicity (Observation 1.1.2 & 1.1.4 & 1.1.5)**:
   - When an incident is created, claimed, or transitioned, SQLite execution is wrapped in `DatabaseManager.transaction((db) => { ... })`.
   - `BEGIN IMMEDIATE` guarantees an exclusive write lock, preventing interleaved mutations.
   - For creation, both `INSERT INTO incidents` and `INSERT INTO status_history (previous_status: NULL, new_status: 'Reported')` succeed or roll back together.
   - For claiming, the CAS update and `INSERT INTO status_history (previous_status: 'Reported', new_status: 'Claimed')` succeed together; if `changes === 0`, `ConflictError` is thrown, aborting the transaction and leaving zero extraneous audit rows.
   - For state transitions, status update and `INSERT INTO status_history` are committed atomically.

3. **Concurrency Safety & Mutual Exclusion (Observation 1.1.4 & 1.2.2)**:
   - Naive read-then-update logic suffers from race conditions where two threads read `status = 'Reported'` and both proceed to update.
   - The Compare-and-Swap SQL predicate `WHERE id = ? AND status = 'Reported'` shifts the concurrency check into the atomic SQLite engine row update.
   - Exactly one statement can match the row while `status = 'Reported'`. It returns `changes: 1`.
   - The second concurrent query finds `status` is already `'Claimed'`. It matches 0 rows (`changes: 0`), looks up the incident, and throws `ConflictError` (HTTP 409).
   - Confirmed by `tests/concurrency.test.js` under `Promise.all` simultaneous requests: exactly one 200 OK and one 409 Conflict.

4. **Role Scoping & Privacy Isolation (Observation 1.1.3 & 1.1.6)**:
   - Citizens querying `GET /api/incidents` always have `reporter_id = ?` injected into their SQL query, ensuring no cross-tenant leakage.
   - Citizens querying `GET /api/incidents/:id` are checked with `incident.reporter_id !== userId`, returning HTTP 403 Forbidden.
   - Heroes querying `GET /api/incidents` default to open incidents (`status = 'Reported'`) unless filtering explicitly.
   - RBAC route guards (`requireRole('Citizen')` / `requireRole('Hero')`) strictly prevent role crossing (Hero creating incident returns 403; Citizen claiming returns 403).

5. **State Transition Rigidity & Ownership Protection (Observation 1.1.5)**:
   - Transitions strictly enforce `Reported` -> `Claimed` -> `In Progress` -> `Resolved`.
   - Direct status modification of `Reported` incidents without claiming is rejected with HTTP 400.
   - Skipping `In Progress` (direct jump `Claimed` -> `Resolved`) is rejected with HTTP 400.
   - Backward transitions (`In Progress` -> `Reported`) and terminal mutations (`Resolved` -> `In Progress`) are rejected with HTTP 400.
   - If an unassigned hero attempts `PATCH /api/incidents/:id/status`, `incident.hero_id !== heroId` triggers `ForbiddenError` (HTTP 403).

---

## 3. Caveats

- **No Caveats**: All Milestone 2 requirements, edge cases, error codes, and concurrency safeguards are fully implemented, structurally compliant, and verified against 100% of unit and E2E test suites with zero failures.

---

## 4. Conclusion

Milestone 2 (Incident Lifecycle & Concurrency) is completely implemented and verified in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
- **Requirement R1/R2 RBAC**: Citizens report incidents (POST 201), Heroes claim them (POST 200). Role boundaries strictly enforced with HTTP 403.
- **Requirement R2 State Machine**: Strict lifecycle `Reported` -> `Claimed` -> `In Progress` -> `Resolved`. Invalid jumps and backward mutations rejected with HTTP 400.
- **Requirement R2 Concurrency**: Atomic CAS ensures exactly one hero claims an incident during race conditions, with losing requests receiving HTTP 409 Conflict.
- **Requirement R2 Ownership**: Assigned hero ownership strictly guarded; unauthorized heroes receive HTTP 403.
- **Requirement R3 Audit Trail**: Complete append-only `status_history` captured atomically for all state changes.
- **Test Health**: 13/13 targeted M2 tests pass, 101/101 unit tests pass, and 230/230 total tests pass (100% pass rate).

---

## 5. Verification Method

To independently reproduce and verify this handoff:

1. **Navigate to Target Repository**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   ```

2. **Execute Milestone 2 Targeted Tests**:
   ```powershell
   node --test tests/incidents.test.js tests/lifecycle.test.js tests/concurrency.test.js
   ```
   *Expected output*: 13 tests pass, 0 fail (Duration < 1.5s).

3. **Execute Full Unit Test Suite**:
   ```powershell
   npm run test:unit
   ```
   *Expected output*: 101 tests pass, 0 fail (Duration < 3s).

4. **Execute Full Project Test Suite**:
   ```powershell
   npm test
   ```
   *Expected output*: 230 tests pass across 48 suites, 0 fail (Duration < 4s).

5. **Invalidation Conditions**:
   - Any test failure or non-zero exit code on the above test commands.
   - Concurrent claim requests resulting in more than one HTTP 200 response.
   - An unassigned hero successfully modifying status on an incident claimed by another hero.
   - Status transitions bypassing `In Progress` (direct jump `Claimed` -> `Resolved`) succeeding with HTTP 200 instead of HTTP 400.
   - Missing or misaligned records in `status_history`.
