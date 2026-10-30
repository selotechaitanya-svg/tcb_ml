# Milestone 1 Quality & Adversarial Review Report

**Agent**: `reviewer_m1_1` (teamwork_reviewer)  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\reviewer_m1_1\`  
**Target Workspace**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Date**: 2026-10-29T20:55:00Z  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

The Milestone 1 implementation is exceptionally well-constructed, clean, and completely free of any integrity violations (no hardcoded test mocks, facades, or shortcuts). Foreign key cascades, check constraints, indexes, triggers, connection pooling, transactions with savepoints, and query parameter handling all pass rigorous tests. `node --test tests/auth.test.js` passes 27/27 tests.

However, an adversarial concurrency race condition was identified at the SQLite DDL layer in `src/db/schema.sql`: `username TEXT NOT NULL UNIQUE` lacks `COLLATE NOCASE`. Under concurrent registrations with case variation (e.g. `PeterParker` vs `peterparker`), both requests bypass the async bcrypt window, both SQLite binary inserts succeed, and duplicate accounts with the same case-insensitive username are inserted into the database. This defect causes test line 591 in `tests/adversarial_m1_2.test.js` to fail, causing `npm run test:unit` to exit with code 1. A 1-line DDL fix is required before proceeding to Milestone 2.

---

## 1. Observation

### 1.1 Integrity Violation Assessment
Inspected `src/db/schema.sql`, `src/db/database.js`, `src/services/authService.js`, `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/middleware/auth.js`, `src/middleware/rbac.js`, and `tests/helpers/testDb.js`.
- Performed pattern searches for test fixtures (`peter_parker`, `green_goblin`, `active_citizen`, etc.) across `src/`: 0 hardcoded occurrences found.
- All service logic computes genuine salted password hashes via `bcrypt.hash()` and signs genuine JWT tokens with `jwt.sign()`.
- Central error handling and validation logic implement real branching without facade stubs.

### 1.2 Verification of `node --test tests/auth.test.js`
Executed in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
```powershell
cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"; node --test tests/auth.test.js
```
Verbatim Output:
```
▶ Milestone 1: Authentication & Role-Based Access Control (RBAC)
  ▶ POST /api/auth/register
    ✔ should successfully register a Citizen and return 201 with JWT and sanitized user (80.4038ms)
    ✔ should successfully register a Hero and return 201 with JWT and sanitized user (55.3106ms)
    ✔ should reject duplicate username with 409 Conflict (55.3762ms)
    ✔ should reject duplicate email with 409 Conflict (55.8087ms)
    ✔ should reject registration missing username with 400 Bad Request (2.1975ms)
    ✔ should reject registration missing email with 400 Bad Request (2.0299ms)
    ✔ should reject registration missing password with 400 Bad Request (2.1745ms)
    ✔ should reject registration missing role with 400 Bad Request (2.1817ms)
    ✔ should reject invalid role not in ["Citizen", "Hero"] with 400 Bad Request (1.8479ms)
    ✔ should reject invalid email format with 400 Bad Request (1.8198ms)
    ✔ should reject registration with empty or whitespace-only username with 400 Bad Request (1.7256ms)
    ✔ should reject password shorter than 6 characters with 400 Bad Request (1.6264ms)
  ✔ POST /api/auth/register (263.2443ms)
  ▶ POST /api/auth/login
    ✔ should successfully log in with valid credentials and return 200 with JWT (155.6402ms)
    ✔ should successfully log in a Hero and return correct role payload (155.728ms)
    ✔ should reject login with incorrect password with 401 Unauthorized (159.2694ms)
    ✔ should reject login for non-existent username with 401 Unauthorized (103.0926ms)
    ✔ should reject login with missing username with 400 Bad Request (104.0874ms)
    ✔ should reject login with missing password with 400 Bad Request (105.1186ms)
    ✔ should reject login with empty body with 400 Bad Request (102.6679ms)
  ✔ POST /api/auth/login (885.9039ms)
  ▶ JWT Authentication & RBAC Middleware Enforcement
    ✔ should return 401 Unauthorized when accessing protected route without Authorization header (104.7873ms)
    ✔ should return 401 Unauthorized when accessing protected route with malformed Bearer token (105.7506ms)
    ✔ should return 401 Unauthorized when Bearer token header prefix is missing (104.2548ms)
    ✔ should return 200 OK and attached user payload when valid token is supplied to /api/auth/me (104.6207ms)
    ✔ should return 403 Forbidden when Citizen attempts to access Hero-only endpoint (103.959ms)
    ✔ should return 200 OK when Hero accesses Hero-only endpoint (103.0714ms)
    ✔ should return 403 Forbidden when Hero attempts to access Citizen-only endpoint (115.2748ms)
    ✔ should return 200 OK when Citizen accesses Citizen-only endpoint (130.1549ms)
  ✔ JWT Authentication & RBAC Middleware Enforcement (872.2688ms)
✔ Milestone 1: Authentication & Role-Based Access Control (RBAC) (2023.0431ms)
ℹ tests 27
ℹ suites 4
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2227.3069
```
Exit code: `0`.

### 1.3 DDL Constraints, Foreign Keys & Cascades Verification
Executed independent test script (`test_ddl_integrity.js`):
1. `PRAGMA foreign_keys;` returned `1` (active).
2. Inserting invalid role (`'Villain'`) triggered `CHECK constraint failed`.
3. Inserting severity `0` or `6` triggered `CHECK constraint failed`.
4. Inserting status not in `('Reported', 'Claimed', 'In Progress', 'Resolved')` triggered `CHECK constraint failed`.
5. Inserting non-existent `reporter_id` triggered `FOREIGN KEY constraint failed`.
6. Deleting a user referenced by `incidents.reporter_id` triggered `FOREIGN KEY constraint failed` (`ON DELETE RESTRICT`).
7. Deleting an incident caused all corresponding `status_history` records to delete automatically (`ON DELETE CASCADE`).
8. Deleting a hero user caused `incidents.hero_id` to be set to `NULL` (`ON DELETE SET NULL`).
9. Triggers `trg_users_updated_at` and `trg_incidents_updated_at` update `updated_at` timestamp on updates.
10. All 10 declared indexes are present in `sqlite_master`.
11. Transactions with `BEGIN IMMEDIATE` and nested savepoints commit and roll back cleanly.

### 1.4 Parameter Handling Stress Testing
Executed adversarial parameter test (`test_params_adversarial.js`) across 10 permutations:
- No arguments: `db.get('SELECT 1 as num')` -> `1`
- Positional array: `db.get('SELECT ? as a, ? as b', ['alpha', 100])` -> `{ a: 'alpha', b: 100 }`
- Single element array: `db.get('SELECT ? as val', ['single'])` -> `{ val: 'single' }`
- Primitive without array: `db.get('SELECT ? as val', 999)` -> `{ val: 999 }`
- Named object with prefix: `db.get('SELECT :name as name', { ':name': 'spidey' })` -> `{ name: 'spidey' }`
- Named object with bare keys: `db.get('SELECT :name as name', { name: 'spidey' })` -> `{ name: 'spidey' }`
- Named object wrapped in array: `db.get('SELECT :name as name', [{ name: 'peter' }])` -> `{ name: 'peter' }`
- Null/undefined: correctly handled without exception.
- Query/all and Run/changes: fully operational.

### 1.5 Unit Test Suite Failure on Case-Insensitive Concurrent Registration
Executed `npm run test:unit` in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
```
> spider-sense-backend@1.0.0 test:unit
> node --test tests/*.test.js
...
test at tests\adversarial_m1_2.test.js:591:5
✖ should reject concurrent registrations with case-insensitive collision ("PeterParker" vs "peterparker") (104.7878ms)
  AssertionError [ERR_ASSERTION]: Expected case-insensitive collision to resolve as [201, 409], got [201, 201]
  + actual - expected
    [
      201,
  +   201
  -   409
    ]
...
ℹ tests 49
ℹ suites 10
ℹ pass 48
ℹ fail 1
Exit code: 1
```

---

## 2. Logic Chain

1. **TOCTOU Race Condition on Username Registration**:
   - In `src/services/authService.js` (lines 23-34):
     ```javascript
     const existingUser = get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [validated.username]);
     if (existingUser) {
       throw new ConflictError('Username already in use');
     }
     const passwordHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);
     ```
   - When two requests with differing case (e.g. `PeterParkerCase` and `peterparkercase`) arrive concurrently:
     - Request 1 checks `SELECT ... COLLATE NOCASE`: finds 0 rows.
     - Request 2 checks `SELECT ... COLLATE NOCASE`: finds 0 rows.
     - Both proceed to compute `await bcrypt.hash()` (~50-100ms async delay).
2. **Database Constraint Collation Gap**:
   - In `src/db/schema.sql` (line 7):
     ```sql
     username TEXT NOT NULL UNIQUE,
     ```
   - SQLite table-level `UNIQUE` constraints default to `BINARY` collation.
   - Under `BINARY` collation, `'PeterParkerCase' != 'peterparkercase'`.
   - Therefore, SQLite's unique constraint check allows both inserts to succeed.
   - Result: Both requests receive `201 Created`, creating two colliding records in the `users` table.
3. **Test Suite Failure**:
   - Because `package.json` defines `"test:unit": "node --test tests/*.test.js"`, `npm run test:unit` executes `tests/adversarial_m1_2.test.js` and fails with exit code 1.
4. **Resolution Verification**:
   - Testing simulation in `test_fix_simulation.js` proved that defining:
     ```sql
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     ```
     in `src/db/schema.sql` enforces case-insensitivity at the database constraint level. When a race condition occurs, SQLite throws `UNIQUE constraint failed: users.username`, which `authService.js` line 44 already catches and converts into HTTP 409 Conflict.

---

## 3. Findings

### [Major] Finding 1: Missing `COLLATE NOCASE` on `users.username` in `schema.sql`

- **What**: The `users.username` column definition does not specify `COLLATE NOCASE`.
- **Where**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back\src\db\schema.sql`, line 7 (and line 8 for `email`).
- **Why**: SQLite defaults to `BINARY` collation for UNIQUE constraints. An application-level `SELECT ... COLLATE NOCASE` check is susceptible to a Time-of-Check to Time-of-Use (TOCTOU) race condition during async password hashing, allowing concurrent registrations of identical case-variant usernames to both succeed with HTTP 201.
- **Suggestion**:
  Update `src/db/schema.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  ```

---

## 4. Caveats

- Milestone 2 incident routes are not yet implemented (stubs/fallbacks exist in `src/app.js`), which is expected and documented for Milestone 1 scope.
- In-memory SQLite execution in tests does not write to disk; however, disk-backed WAL mode was independently tested and verified.

---

## 5. Conclusion

Milestone 1 work is genuine, high-quality, and robust across 99% of criteria. To achieve 100% test passing on `npm run test:unit` and eliminate the concurrent registration case-collision vulnerability, the worker must update `src/db/schema.sql` to add `COLLATE NOCASE` to `users.username` (and `users.email`).

**Verdict**: **REQUEST_CHANGES**

---

## 6. Verification Method

To independently verify the fix:

1. Update `src/db/schema.sql` with `COLLATE NOCASE` on `username` and `email`.
2. Run the full unit test suite:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   npm run test:unit
   ```
   *Expected Result*: All tests pass (0 failures), exiting with code 0.
3. Run the specific M1 test suite:
   ```powershell
   node --test tests/auth.test.js
   ```
   *Expected Result*: 27 passed, 0 failed.
