# Handoff: Atomic Compare-and-Swap (CAS) Claiming and Concurrency Architecture (Milestone 2)

**Agent ID**: `explorer_m2_2`  
**Working Directory**: `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m2_2`  
**Target Repository**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Milestone**: Milestone 2 — Incident Lifecycle, Atomic Claiming & Concurrency  
**Date**: 2026-10-29T21:15:00Z  

---

## 1. Observation

### 1.1 Source Code and Route Configuration
- **Route Guard and Definition (`src/routes/incidentRoutes.js:21`)**:
  ```javascript
  router.post('/:id/claim', requireRole('Hero'), incidentController.claimIncident);
  ```
  Strictly restricted to users possessing the `'Hero'` role via `requireRole('Hero')` (`src/middleware/rbac.js:10-23`). Citizens or unauthenticated callers receive HTTP 403 or 401 respectively.

- **Controller Validation & Dispatch (`src/controllers/incidentController.js:6-12, 72-81`)**:
  ```javascript
  function parseIncidentId(paramId) {
    const id = Number(paramId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError(`Invalid incident ID format: '${paramId}'`);
    }
    return id;
  }
  ...
  async claimIncident(req, res, next) {
    try {
      const id = parseIncidentId(req.params.id);
      const heroId = req.user.id || req.user.userId;
      const incident = incidentService.claimIncident(id, heroId);
      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  }
  ```
  Validates that `:id` is a strictly positive integer, extracts `heroId` from the authenticated JWT token (`req.user.id || req.user.userId`), delegates to `incidentService.claimIncident`, and returns HTTP 200 with the updated incident JSON.

- **Atomic CAS Implementation in Service (`src/services/incidentService.js:163-192`)**:
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

- **Transaction Semantics (`src/db/database.js:139-188`)**:
  Uses `BEGIN IMMEDIATE;` to acquire an exclusive write lock immediately at transaction start, preventing upgrade deadlocks and serializing database writes while executing synchronously under `node:sqlite`.

- **Domain Error Mapping (`src/utils/errors.js:55-68`, `src/middleware/errorHandler.js:8-41`)**:
  - `NotFoundError`: `statusCode = 404` (`{ error: 'Incident not found' }`)
  - `ConflictError`: `statusCode = 409` (`{ error: "Incident cannot be claimed: current status is '...' " }`)
  - `BadRequestError`: `statusCode = 400` (`{ error: "Invalid incident ID format: '...' " }`)
  - `ForbiddenError`: `statusCode = 403` (`{ error: "Access forbidden: user role 'Citizen' not permitted" }`)

### 1.2 Test Suite Execution Output
Direct test execution was performed via `run_command`:
1. `node --test tests/concurrency.test.js`:
   ```
   ▶ Concurrency Control: Race Conditions on Incident Claiming
     ✔ should ensure exactly one hero claims an incident during concurrent claim race conditions (202.0234ms)
     ✔ should reject claim on already Claimed incident with 409 Conflict (163.3885ms)
   ✔ Concurrency Control: Race Conditions on Incident Claiming (367.2078ms)
   ℹ tests 2, suites 1, pass 2, fail 0
   ```
2. `node --test tests/e2e/tier4_real_world.test.js`:
   ```
   ▶ Tier 4: Real-World Multi-Step End-to-End Workloads
     ✔ Scenario 1: Midtown Bank Robbery full lifecycle (Reported -> Claimed -> In Progress -> Resolved + Audit) (154.2636ms)
     ✔ Scenario 2: Queens Fire multi-hero race condition (atomic CAS concurrency) (23.9791ms)
     ✔ Scenario 3: Multi-Citizen neighborhood watch (strict tenant isolation across boroughs) (23.9593ms)
     ✔ Scenario 4: Hero shift workload (large batch traversal, multi-field filtering, pagination) (42.5163ms)
     ✔ Scenario 5: Rogue actor defense (unauthorized, role violation, hijack, terminal state mutation) (35.5214ms)
   ✔ Tier 4: Real-World Multi-Step End-to-End Workloads (280.999ms)
   ℹ tests 5, suites 1, pass 5, fail 0
   ```
3. Full test command `npm test`:
   ```
   ℹ tests 230
   ℹ suites 48
   ℹ pass 230
   ℹ fail 0
   ℹ duration_ms 3015.4591
   ```

---

## 2. Logic Chain

### 2.1 The Race Condition Threat Model
1. **Naive Non-Atomic Pattern**:
   If an application reads the record first (`SELECT status FROM incidents WHERE id = ?`), checks `status === 'Reported'` in JavaScript memory, and then executes `UPDATE incidents SET status = 'Claimed'`, two concurrent requests (e.g. Hero A and Hero B arriving within the same event loop tick) can both read `'Reported'`, both pass the check, and both issue `UPDATE`. The second update overwrites `hero_id`, resulting in a race condition where two heroes are notified of success or the rightful claim is hijacked.
2. **Compare-and-Swap (CAS) Atomic Resolution**:
   By moving the conditional check into the SQL engine predicate:
   ```sql
   UPDATE incidents
   SET status = 'Claimed', hero_id = :heroId, updated_at = CURRENT_TIMESTAMP
   WHERE id = :id AND status = 'Reported'
   ```
   the evaluation of the condition and the row mutation occur as a single indivisible B-tree operation inside SQLite.
3. **Execution Outcomes under `node:sqlite`**:
   - `DatabaseSync.StatementSync.run()` returns `{ changes: number, lastInsertRowid: number|bigint }`.
   - When Hero 1 executes, `status` is `'Reported'`. SQLite modifies the row; `result.changes` is exactly `1`. Hero 1 is the deterministic winner.
   - When Hero 2 executes (even in parallel or immediately subsequent), `status` is now `'Claimed'`. The `WHERE` clause evaluates to `FALSE` for that row. Zero rows match; `result.changes` is exactly `0`.
4. **Fallback Diagnostics and Status Code Mapping**:
   When `result.changes === 0`, the reason must be ascertained to provide accurate HTTP semantics:
   - If `SELECT id FROM incidents WHERE id = :id` returns no row -> the incident does not exist -> throw `NotFoundError` -> HTTP 404 Not Found.
   - If the row exists -> the incident exists but is not in `'Reported'` status (it is `'Claimed'`, `'In Progress'`, or `'Resolved'`) -> throw `ConflictError` -> HTTP 409 Conflict.
5. **Atomic Audit Logging**:
   - To guarantee compliance with Requirement R3 and avoid phantom audit rows, status history insertion MUST be colocated in the same transaction as the CAS update.
   - If the winner updates the incident (`changes === 1`), `INSERT INTO status_history` records the transition (`Reported -> Claimed`).
   - If the loser fails (`changes === 0`), `ConflictError` is thrown, triggering `ROLLBACK`, guaranteeing zero partial writes and zero uncommitted audit records.
6. **Concurrency Safety in In-Memory and WAL Modes**:
   - In `:memory:` mode (used by unit and E2E test suites), `node:sqlite` executes synchronously on the V8 main thread. `DatabaseManager.transaction()` wraps execution in `BEGIN IMMEDIATE;`, ensuring that concurrent asynchronous promises (dispatched via `Promise.all`) are serialized through synchronous execution blocks without interleaving mid-transaction.
   - In WAL mode (`data/spidersense.db`), SQLite permits concurrent readers while serializing writers via file locks on the WAL index (`-shm` and `-wal`), ensuring atomic durability without database corruption.

---

## 3. Caveats

1. **Synchronous node:sqlite Callbacks**:
   `DatabaseManager.transaction(fn)` strictly forbids async/Promise-returning callbacks because SQLite C-bindings in `node:sqlite` require synchronous execution to pair `BEGIN IMMEDIATE` with `COMMIT`/`ROLLBACK`. All async operations (e.g., password hashing, token validation) must be completed before entering the database transaction.
2. **Double-Claiming by Same Hero**:
   If the winning hero attempts to re-claim their own already-claimed incident, the CAS statement evaluates `status = 'Reported'`, which is false (`status` is `'Claimed'`). This correctly yields `changes === 0` and responds with HTTP 409 Conflict.
3. **Trigger Interaction with Explicit Timestamps**:
   The table DDL includes `CREATE TRIGGER trg_incidents_updated_at AFTER UPDATE ON incidents FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at BEGIN UPDATE incidents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;`. Because the CAS query explicitly specifies `updated_at = CURRENT_TIMESTAMP`, the `WHEN NEW.updated_at = OLD.updated_at` condition prevents recursive trigger firing while guaranteeing an updated timestamp for assertion in test `8.5`.

---

## 4. Conclusion

1. **Endpoint Specification**:
   - `POST /api/incidents/:id/claim` is fully specified, guarded by `authenticate` and `requireRole('Hero')`.
   - Returns HTTP 200 with the claimed incident object for the winning hero.
   - Returns HTTP 409 Conflict for rival heroes or repeated claims.
   - Returns HTTP 404 Not Found for non-existent IDs.
   - Returns HTTP 400 Bad Request for non-numeric/invalid IDs.
   - Returns HTTP 403 Forbidden for non-Hero users (e.g. Citizens).
2. **Concurrency Guarantees**:
   - Atomic SQL Compare-and-Swap `UPDATE incidents SET status = 'Claimed', hero_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Reported'` guarantees mutual exclusion.
   - Verified under `Promise.all` multi-hero race conditions across both dedicated concurrency tests (`tests/concurrency.test.js`) and end-to-end real-world scenarios (`tests/e2e/tier4_real_world.test.js`).
3. **Audit Trail Integrity**:
   - `status_history` is atomically updated within the same immediate transaction, recording `{ previous_status: 'Reported', new_status: 'Claimed', changed_by_user_id: heroId }`.
   - Concurrency conflicts generate zero extraneous audit rows.
4. **Current Status**:
   - The implementation is completely verified, with 100% pass rate (230/230 tests passing) across all test tiers.

---

## 5. Verification Method

### 5.1 Independent Test Commands
Execute the following commands in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:

1. **Verify Concurrency Race Condition**:
   ```bash
   node --test tests/concurrency.test.js
   ```
   *Expected*: 2 passing tests verifying that simultaneous claims under `Promise.all` result in exactly one 200 OK and one 409 Conflict, with exactly one audit record in `status_history`.

2. **Verify Real-World E2E Scenario 2 (Multi-Hero Race Condition)**:
   ```bash
   node --test tests/e2e/tier4_real_world.test.js
   ```
   *Expected*: 5 passing tests, including Scenario 2 (Queens Fire race condition between Daredevil and Wolverine) and Scenario 5 (Rogue actor defense rejecting re-claim with 409).

3. **Verify Boundary and Negative Cases**:
   ```bash
   node --test tests/e2e/tier2_boundary_corner.test.js
   ```
   *Expected*: Verifies 404 for non-existent incident claiming, 409 for claiming In Progress/Resolved incidents, and 400 for invalid ID format.

4. **Verify Full Repository Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: All 230 tests across all 48 test suites pass with 0 failures.

### 5.2 Key Inspection Points
- `src/services/incidentService.js:163-192`: Verify the CAS SQL statement, transaction wrapper, `changes === 0` fallback query, and `status_history` insert.
- `src/controllers/incidentController.js:6-12, 72-81`: Verify `parseIncidentId` validation and `heroId` resolution.
- `src/routes/incidentRoutes.js:21`: Verify `requireRole('Hero')` middleware attachment.
