# Adversarial Verification & Challenge Report: Milestone 1 Database Integrity, DDL Constraints & Concurrency Safety

**Agent**: `challenger_m1_2` (teamwork_challenger)  
**Roles**: critic, specialist  
**Target Workspace**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Milestone**: Milestone 1 (Database Schema, DDL Constraints, Transaction Atomicity & Concurrency Safety)  
**Date**: 2026-10-29T20:48:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Adversarial stress harness `tests/adversarial_m1_2.test.js` was constructed and executed directly against the codebase in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
`cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"; node --test tests/adversarial_m1_2.test.js`

### Execution Output Summary
```
▶ Milestone 1 Adversarial Verification: Database Integrity, Constraints & Concurrency Safety
  ▶ 1. SQLite Constraint Enforcement (CHECK Constraints)
    ✔ should reject invalid roles in users table (NOT IN ("Citizen", "Hero")) (2.9155ms)
    ✔ should reject NULL role in users table (NOT NULL constraint) (1.0602ms)
    ✔ should allow valid roles "Citizen" and "Hero" (0.9228ms)
    ✔ should reject invalid severity in incidents table (severity < 1 or severity > 5) (0.9753ms)
    ✔ should allow all valid severities (1 through 5) in incidents table (0.9839ms)
    ✔ should reject invalid status in incidents table (not in Reported, Claimed, In Progress, Resolved) (1.0099ms)
    ✔ should reject invalid status transitions or invalid new_status in status_history table (0.8851ms)
  ✔ 1. SQLite Constraint Enforcement (CHECK Constraints) (9.4546ms)
  ▶ 2. Foreign Key Constraint Enforcement
    ✔ should reject inserting an incident with a non-existent reporter_id (0.7214ms)
    ✔ should reject deleting a reporter while incidents exist (ON DELETE RESTRICT) (0.8859ms)
    ✔ should delete associated status_history records when incident is deleted (ON DELETE CASCADE) (0.8572ms)
    ✔ should set hero_id to NULL if hero user is deleted (ON DELETE SET NULL) (0.7982ms)
  ✔ 2. Foreign Key Constraint Enforcement (3.4412ms)
  ▶ 3. Transaction Atomicity & Rollback Verification
    ✔ should completely roll back single-table modifications when transaction throws an error (0.7793ms)
    ✔ should completely roll back multi-table operations when an error occurs mid-flight (0.7789ms)
    ✔ should roll back earlier statements when a subsequent statement triggers a SQLite constraint error (0.7424ms)
    ✔ should support nested transactions via savepoints with partial rollback isolation (0.7315ms)
    ✔ should roll back both inner and outer changes when outer transaction fails after inner commits (0.7172ms)
    ✖ should support async functions in transactions or prevent premature synchronous commits (32.1761ms)
  ✖ 3. Transaction Atomicity & Rollback Verification (36.5237ms)
  ▶ 4. Concurrent Registration Stress Testing
    ✔ should ensure exactly one request succeeds (201) and the duplicate gets 409 under 2 simultaneous registrations (132.8704ms)
    ✔ should ensure exactly 1 succeeds (201) and 9 receive 409 under 10 simultaneous registrations (515.9007ms)
    ✔ should reject concurrent registrations with same username but different emails (106.3825ms)
    ✔ should reject concurrent registrations with same email but different usernames (108.1741ms)
    ✖ should reject concurrent registrations with case-insensitive collision ("PeterParker" vs "peterparker") (106.7359ms)
  ✖ 4. Concurrent Registration Stress Testing (970.4263ms)
  ▶ 5. File-Backed SQLite WAL Mode Verification
    ✔ should configure WAL mode and enforce foreign keys on a disk-persisted database (12.2232ms)
  ✔ 5. File-Backed SQLite WAL Mode Verification (12.2753ms)
ℹ tests 23 | pass 21 | fail 2 | duration_ms 1256.9124
```

### Specific Observations

1. **Obs-1 (CHECK & Foreign Key Constraints - Pass)**:
   - Invalid roles (`Admin`, `Villain`, `Police`, `CitizenExtra`, ``, `citizen`, `hero`, `SUPERHERO`, `null`) are rejected at the SQLite engine level with `ERR_SQLITE_ERROR: CHECK constraint failed: role IN ('Citizen', 'Hero')`.
   - Invalid severities (`0`, `-1`, `-99`, `6`, `7`, `10`, `100`) are rejected at the SQLite engine level with `ERR_SQLITE_ERROR: CHECK constraint failed: severity >= 1 AND severity <= 5`.
   - Invalid incident statuses (`Open`, `Pending`, `Closed`, `Archived`, etc.) are rejected with `CHECK constraint failed: status IN ('Reported', 'Claimed', 'In Progress', 'Resolved')`.
   - Non-existent `reporter_id` insertion is rejected with `ERR_SQLITE_ERROR: FOREIGN KEY constraint failed`.
   - `DELETE FROM users WHERE id = reporter_id` with active incidents is blocked by `ON DELETE RESTRICT` (`ERR_SQLITE_ERROR: FOREIGN KEY constraint failed`), and user row remains intact.
   - `DELETE FROM incidents WHERE id = incident_id` cascades deletion to all referenced `status_history` rows via `ON DELETE CASCADE`.
   - `DELETE FROM users WHERE id = hero_id` triggers `ON DELETE SET NULL`, preserving the incident while updating `incidents.hero_id` to `NULL`.

2. **Obs-2 (Identical Concurrent Registrations - Pass)**:
   - Simultaneous registration requests with identical username and email (`Promise.all` across 2 requests, and a burst of 10 requests) resulted in exactly 1 request receiving `201 Created` and all duplicate requests receiving `409 Conflict`. Zero requests returned 500. Exactly 1 user row was persisted.

3. **Obs-3 (Defect 1: Concurrent Case-Variant Collision & Account Shadowing - FAIL)**:
   - In `tests/adversarial_m1_2.test.js:616`, simultaneous registration requests with case-permutations (`PeterParker` vs `peterparker`) both returned HTTP 201 Created (`[201, 201]`).
   - Querying SQLite directly verified two distinct user rows in `users`:
     `[ { id: 1, username: 'PeterParker' }, { id: 2, username: 'peterparker' } ]`
   - When user 2 subsequently attempted to log in via `authService.loginUser('peterparker', 'password2')`, login failed with `HTTP 401 Unauthorized` (`Invalid credentials`) because `SELECT ... WHERE username = ? COLLATE NOCASE` matched user 1, comparing user 2's password against user 1's hash. User 2 is permanently locked out.
   - File inspection: `src/db/schema.sql` line 6-13 defines:
     `username TEXT NOT NULL UNIQUE,`
     `email TEXT NOT NULL UNIQUE,`
     SQLite defaults to case-sensitive `BINARY` collation. In `src/services/authService.js` line 23-39:
     ```javascript
     const existingUser = get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [validated.username]);
     if (existingUser) throw new ConflictError('Username already in use');
     // ...
     const passwordHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);
     // ...
     insertResult = run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ...);
     ```
     `await bcrypt.hash(...)` yields the event loop. During this asynchronous hashing window, both requests pass the `SELECT` existence check, and SQLite's case-sensitive binary UNIQUE constraint permits both inserts.

4. **Obs-4 (Defect 2: Premature Commit of Async Transaction Callbacks - FAIL)**:
   - In `tests/adversarial_m1_2.test.js:482`, an async callback was passed to `db.transaction(async (tx) => { tx.run('INSERT ...'); await delay(20); throw new Error(); })`.
   - Inspection of `users` after the thrown error revealed that the inserted user was NOT rolled back, but was permanently committed.
   - File inspection: `src/db/database.js` line 139-168:
     ```javascript
     transaction(fn) {
       // ...
       if (isTopLevel) this.db.exec('BEGIN IMMEDIATE;');
       try {
         const result = fn(this);
         if (isTopLevel) this.db.exec('COMMIT;');
         return result;
       } catch (err) {
         if (isTopLevel) this.db.exec('ROLLBACK;');
         throw err;
       }
     }
     ```
     `const result = fn(this);` returns a Promise. Because `transaction()` does not inspect or await `result.then`, `this.db.exec('COMMIT;')` executes immediately on tick 1, committing before the callback finishes.

---

## 2. Logic Chain

1. **Relational Constraints & Data Engine**:
   - *From Obs-1*: `src/db/database.js` initializes `DatabaseSync` with `PRAGMA foreign_keys = ON;` and `PRAGMA busy_timeout = 5000;`, and enables `PRAGMA journal_mode = WAL;` on disk databases. SQLite enforces all DDL CHECK constraints and foreign key RESTRICT/CASCADE/SET NULL rules exactly as specified in R3.
2. **Synchronous Transaction Atomicity**:
   - *From Obs-1 & Obs-3*: When callbacks are synchronous, `DatabaseManager.prototype.transaction` uses `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` with `SAVEPOINT` nested depth tracking, correctly isolating sub-transactions and providing complete rollback on errors.
3. **Concurrency Race Condition on Casing Permutations**:
   - *From Obs-3*: The worker intended usernames to be case-insensitively unique, as evidenced by `COLLATE NOCASE` in `authService.js` and the explicit claim in `worker_m1/handoff.md`: *"rejects casing-permutation duplicates using COLLATE NOCASE."*
   - However, application-level uniqueness checks prior to asynchronous password hashing (`await bcrypt.hash`) are vulnerable to race conditions (Time-of-Check to Time-of-Use).
   - Because `src/db/schema.sql` declared `username TEXT NOT NULL UNIQUE` without `COLLATE NOCASE`, SQLite's internal unique index uses binary collation. Under concurrent requests with different casing (`PeterParker` vs `peterparker`), both bypass the application check during hashing, and SQLite permits both rows.
   - In `loginUser`, the query `SELECT ... WHERE username = ? COLLATE NOCASE` always selects the first registered user in the B-Tree. The second user's credentials fail password verification, resulting in permanent account hijacking and lockout.
4. **Empirical Verification of Proposed Fix**:
   - Adding `COLLATE NOCASE` to `schema.sql`:
     `username TEXT NOT NULL UNIQUE COLLATE NOCASE,`
     `email TEXT NOT NULL UNIQUE COLLATE NOCASE,`
     was empirically verified via Node.js execution. SQLite immediately intercepts the concurrent insert and throws `UNIQUE constraint failed: users.username`. `authService.js` lines 43-48 catch this and return `HTTP 409 Conflict`, resolving the race condition to `[201, 409]`.
5. **Async Transaction Risk**:
   - *From Obs-4*: In Express.js backend services, database operations often occur inside async handlers. If a developer wraps async code in `db.transaction(async (tx) => ...)`, `transaction` commits on tick 1 before asynchronous operations resolve. If an error occurs subsequently, partial database state is left committed.

---

## 3. Challenge Report

### Challenge Summary
**Overall Risk Assessment**: **HIGH**

### Challenges

#### [Critical] Challenge 1: Case-Insensitive Concurrent Registration Hijack / Account Shadowing
- **Assumption Challenged**: Application-level `SELECT ... COLLATE NOCASE` ensures case-insensitive uniqueness across concurrent registrations.
- **Attack Scenario**: Two users or an adversary concurrently submit registration requests for `SpiderMan` and `spiderman`. Both pass `SELECT id FROM users WHERE username = ? COLLATE NOCASE` while waiting for `bcrypt.hash`. Both `INSERT` statements succeed because `schema.sql` defines `username TEXT NOT NULL UNIQUE` with SQLite's default binary collation.
- **Blast Radius**: Duplicate accounts created. `loginUser` queries with `COLLATE NOCASE` and retrieves the first record, permanently locking out the second user with `401 Unauthorized` (`Invalid credentials`).
- **Mitigation**: Update `src/db/schema.sql`:
  ```sql
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ```

#### [High] Challenge 2: Premature Commit & Rollback Failure on Async Transaction Callbacks
- **Assumption Challenged**: `db.transaction(fn)` guarantees atomicity across all application callbacks.
- **Attack Scenario**: Caller supplies an `async` function (`await transaction(async (tx) => { ... })`).
- **Blast Radius**: Transaction executes `COMMIT` synchronously before Promises settle. Errors thrown after the first async await leave preceding database mutations committed.
- **Mitigation**: Make `transaction` Promise-aware or defensively reject Promises:
  ```javascript
  if (result && typeof result.then === 'function') {
    this.db.exec(isTopLevel ? 'ROLLBACK;' : `ROLLBACK TO SAVEPOINT ${savepointName};`);
    throw new TypeError('DatabaseManager.transaction does not accept async functions. Ensure all transaction operations are synchronous.');
  }
  ```

### Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Invalid user roles (`Admin`, `Villain`, etc.) | SQLite CHECK failure | Throws `CHECK constraint failed: role` | **PASS** |
| Invalid incident severity (<1 or >5) | SQLite CHECK failure | Throws `CHECK constraint failed: severity` | **PASS** |
| Invalid incident status (`Open`, etc.) | SQLite CHECK failure | Throws `CHECK constraint failed: status` | **PASS** |
| Non-existent `reporter_id` | SQLite FK failure | Throws `FOREIGN KEY constraint failed` | **PASS** |
| Delete reporter with active incidents | SQLite FK RESTRICT | Throws `FOREIGN KEY constraint failed`, user preserved | **PASS** |
| Delete incident with status history | Cascade delete history | Incident and all history rows deleted | **PASS** |
| Delete hero assigned to incident | SET NULL on hero_id | Incident preserved, `hero_id` becomes `NULL` | **PASS** |
| Synchronous transaction crash mid-flight | Complete rollback | All inserted rows rolled back | **PASS** |
| Savepoint nested transactions | Inner rollback isolated | Inner rolled back, outer committed | **PASS** |
| Concurrent identical registration (2 requests) | Exactly [201, 409] | Received [201, 409], 1 user in DB | **PASS** |
| Concurrent identical registration burst (10 req) | Exactly 1x 201, 9x 409 | Received 1x 201, 9x 409, 0x 500 | **PASS** |
| Concurrent duplicate username, different email | Exactly [201, 409] | Received [201, 409], 1 user in DB | **PASS** |
| Concurrent duplicate email, different username | Exactly [201, 409] | Received [201, 409], 1 user in DB | **PASS** |
| Concurrent case-variant collision (`PeterParker` vs `peterparker`) | Exactly [201, 409] | Received `[201, 201]`, 2 users in DB, user 2 locked out | **FAIL** |
| Async function in `transaction()` | Rollback on rejection | Premature commit on tick 1, partial state persisted | **FAIL** |
| Disk-persisted WAL mode & FK pragma | WAL journal mode, FK ON | Verified WAL mode and FK enforcement on disk | **PASS** |

### Unchallenged Areas
- Incident claiming race conditions (Milestone 2 scope).
- Status transition authorization guards under concurrency (Milestone 2 scope).

---

## 4. Caveats

1. **Sequential vs Concurrent Case Handling**:
   Sequential registration of case permutations (`SpiderMan` followed by `spiderman`) is already blocked with 409 Conflict by the application-level pre-check in `authService.js`. The defect manifests exclusively under concurrent bursts where requests hit the asynchronous password hashing window simultaneously.
2. **Synchronous Transaction Reliability**:
   Synchronous operations inside `db.transaction()` are 100% robust and atomic. The vulnerability is restricted to async function arguments.

---

## 5. Conclusion & Actionable Recommendations

**Verdict**: **REQUEST_CHANGES**

The foundation established in Milestone 1 is well-structured: relational DDL, foreign key constraints (RESTRICT, CASCADE, SET NULL), CHECK constraints, synchronous transaction savepoints, and identical concurrent registration deduplication all perform reliably.

However, database concurrency safety under case-insensitive collision fails at the DDL layer, and async transaction atomicity requires defensive guards.

### Required Actions for `worker_m1`:

1. **Fix `src/db/schema.sql` (Critical)**:
   Add `COLLATE NOCASE` to `users.username` and `users.email`:
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

2. **Harden `src/db/database.js` (High)**:
   In `DatabaseManager.prototype.transaction(fn)`, guard against async callbacks:
   ```javascript
   if (result && typeof result.then === 'function') {
     if (isTopLevel) this.db.exec('ROLLBACK;');
     else this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
     throw new TypeError('DatabaseManager.transaction does not accept async functions. Use synchronous operations within transactions.');
   }
   ```
   Or implement full Promise-resolution handling.

---

## 6. Verification Method

To independently verify these findings and confirm resolution:

1. **Run Full Adversarial Verification Harness**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node --test tests/adversarial_m1_2.test.js
   ```
   *Current state*: 21 pass, 2 fail (documenting the two defects above).  
   *Post-fix state*: 23 pass, 0 fail.

2. **Verify Case-Insensitive Concurrent Race Resolution**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node -e "
   const { setupTestDb, teardownTestDb, getDatabase } = require('./tests/helpers/testDb');
   const request = require('supertest');
   const app = require('./src/app');
   async function test() {
     setupTestDb();
     const [r1, r2] = await Promise.all([
       request(app).post('/api/auth/register').send({ username: 'PeterParker', email: 'p1@test.com', password: 'password123', role: 'Citizen' }),
       request(app).post('/api/auth/register').send({ username: 'peterparker', email: 'p2@test.com', password: 'password123', role: 'Citizen' })
     ]);
     console.log('Statuses:', [r1.status, r2.status].sort());
     teardownTestDb();
   }
   test();
   "
   ```
   *Expected Post-Fix*: `Statuses: [ 201, 409 ]`.
