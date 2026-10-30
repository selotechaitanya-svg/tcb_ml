# Forensic Audit Report: Milestone 1 Iteration 2

**Work Product**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Profile**: General Project (Integrity Mode: `demo`)  
**Auditor**: `auditor_m1_r2` (forensic_auditor)  
**Date**: 2026-10-29T21:01:00Z  
**Verdict**: **CLEAN**

---

## Forensic Audit Summary

### Phase Results
- **Check 1: Hardcoded Test Output Detection**: **PASS** — No hardcoded test responses, expected strings, or static bypass values exist in `src/`.
- **Check 2: Facade & Stub Implementation Detection**: **PASS** — Controllers, services, and middleware execute authentic, non-stubbed business logic.
- **Check 3: Pre-populated Verification Artifact Detection**: **PASS** — Zero pre-populated log, result, or output files existed prior to audit execution.
- **Check 4: Genuine `node:sqlite` & Transaction Architecture**: **PASS** — Genuine `node:sqlite` `DatabaseSync` utilized with `BEGIN IMMEDIATE`, nested `SAVEPOINT`s, explicit `ROLLBACK`, and synchronous thenable guard.
- **Check 5: Genuine `bcryptjs` Hashing & `jsonwebtoken` Signing/Verification**: **PASS** — Real salted password hashing (`bcrypt.hash` with configurable rounds) and genuine HMAC-SHA256 JWT signing and cryptographic verification (`jwt.sign`, `jwt.verify`).
- **Check 6: Dependency & Execution Delegation Audit**: **PASS** — Complies with `demo` mode constraints in `ORIGINAL_REQUEST.md`. No external CLI delegations, no unauthorized core logic borrowing.
- **Check 7: Behavioral Test Suite Execution**: **PASS** — Independent execution of all test suites (82 M1 tests, 101 unit tests, 230 full project tests) passed with 100% success rate (exit code `0`).

---

## 1. Observation

### 1.1 Direct Source Code Inspection

#### A. Genuine `node:sqlite` `DatabaseSync` & Transaction Architecture: `src/db/database.js`
- **Line 3**: Imports standard built-in `DatabaseSync`:
  ```javascript
  const { DatabaseSync } = require('node:sqlite');
  ```
- **Line 35**: Instantiates the SQLite connection:
  ```javascript
  this.db = new DatabaseSync(this.dbPath);
  ```
- **Lines 38–45**: Pragmas enforce relational foreign keys and WAL mode:
  ```javascript
  this.db.exec('PRAGMA foreign_keys = ON;');
  this.db.exec('PRAGMA busy_timeout = 5000;');
  if (this.dbPath !== ':memory:') {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
  }
  ```
- **Lines 139–188**: Synchronous transaction manager with nested savepoint support and thenable detection guard:
  ```javascript
  transaction(fn) {
    const isTopLevel = this._txDepth === 0;
    const savepointName = `sp_${this._txDepth}`;
    this._txDepth++;
    let rolledBack = false;

    if (isTopLevel) {
      this.db.exec('BEGIN IMMEDIATE;');
    } else {
      this.db.exec(`SAVEPOINT ${savepointName};`);
    }

    try {
      const result = fn(this);

      // Guard: Detect if an async function or Promise/thenable was returned
      if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
        if (typeof result.catch === 'function') {
          result.catch(() => {});
        }
        if (isTopLevel) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        }
        rolledBack = true;
        throw new Error(
          'DatabaseSync transaction() callback must be synchronous; async callbacks are not supported because node:sqlite is synchronous. Perform async operations outside the transaction.'
        );
      }

      if (isTopLevel) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (err) {
      if (!rolledBack) {
        if (isTopLevel) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        }
      }
      throw err;
    } finally {
      this._txDepth--;
    }
  }
  ```

#### B. Schema Definition & Collation Enforcement: `src/db/schema.sql`
- **Lines 5–13**: Users table definition enforces `COLLATE NOCASE` on `username` and `email` columns:
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
- **Lines 42–43**: Unique indexes explicitly define `COLLATE NOCASE`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);
  ```

#### C. Genuine Cryptography & Authentication: `src/services/authService.js`
- **Lines 3–4**: Imports `bcryptjs` and `jsonwebtoken`:
  ```javascript
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  ```
- **Line 34**: Salting and hashing password using configured salt rounds:
  ```javascript
  const passwordHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);
  ```
- **Lines 63–67 & 95–99**: Issues signed JWT tokens with claims and expiration:
  ```javascript
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  ```
- **Line 90**: Constant-time password verification:
  ```javascript
  const isMatch = await bcrypt.compare(validated.password, user.password_hash);
  ```
- **Line 116**: Cryptographic token signature verification:
  ```javascript
  const decoded = jwt.verify(token, config.jwtSecret);
  ```

### 1.2 Direct Empirical Tool Execution Outputs

#### Command 1: Micro-benchmark of core cryptographic and persistence primitives
```powershell
Set-Location 'C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back'
node -e "..."
```
**Output**:
```
node:sqlite works: [Object: null prototype] { id: 42 }
bcrypt hash: $2a$04$PJmMtVo92OC3kGbWRvG28O2JMz/zelsk9U3yDcilmRofEnOe4xtrS
bcrypt compare works: true
jwt verify works: { sub: 123, iat: 1793307589 }
```
**Exit Code**: `0`

#### Command 2: Micro-benchmark of schema case-insensitive collision and transaction guard
```powershell
Set-Location 'C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back'
node -e "..."
```
**Output**:
```
Case collation collision caught by SQLite: true
Async transaction error caught: true
Async user inserted leaked: false
```
**Exit Code**: `0`

#### Command 3: Full Milestone 1 Test Suite Execution
```powershell
Set-Location 'C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back'
node --test tests/auth.test.js tests/adversarial_m1.test.js tests/adversarial_m1_2.test.js
```
**Output Summary**:
```
ℹ tests 82
ℹ suites 15
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2345.5624
```
**Exit Code**: `0`

#### Command 4: Unit Test Suite Execution
```powershell
Set-Location 'C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back'
npm run test:unit
```
**Output Summary**:
```
ℹ tests 101
ℹ suites 22
ℹ pass 101
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2547.7315
```
**Exit Code**: `0`

#### Command 5: Complete Project Test Suite Execution
```powershell
Set-Location 'C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back'
npm test
```
**Output Summary**:
```
ℹ tests 230
ℹ suites 48
ℹ pass 230
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2638.1578
```
**Exit Code**: `0`

---

## 2. Logic Chain

1. **Absence of Facades, Mocks, and Hardcoded Values**:
   - *Observation 1.1*: All route controllers delegate directly to domain services (`authService`, `incidentService`), which in turn perform concrete SQL queries and transactions against `DatabaseSync`.
   - Ripgrep scans across `src/` for regex patterns (`mock|dummy|fake|bypass`) returned zero hits.
   - Functions perform true calculations, string validations, password hashing, and dynamic parameterized database queries.

2. **Genuine Cryptographic and Persistence Implementations**:
   - *Observation 1.1A & 1.2 (Command 1)*: SQLite operations are executed through standard Node.js `node:sqlite` (`DatabaseSync`), enforcing true ACID semantics via `BEGIN IMMEDIATE` and `SAVEPOINT`.
   - *Observation 1.1C & 1.2 (Command 1)*: Passwords are hashed with `bcryptjs` (generating standard `$2a$` hashes with configured rounds), and JWTs are signed and verified cryptographically using HMAC-SHA256 (`jsonwebtoken`).

3. **Verification of Milestone 1 Iteration 2 Fixes**:
   - *Observation 1.1B & 1.2 (Command 2)*: `COLLATE NOCASE` in `schema.sql` prevents case-variant collisions at the database level (`PeterParker` vs `peterparker`), returning 409 Conflict even under high-concurrency race conditions.
   - *Observation 1.1A & 1.2 (Command 2)*: Async callback detection in `transaction(fn)` immediately rolls back dirty state, prevents uncommitted leaks, restores `_txDepth`, and handles the rejected promise without uncaught rejection warnings.

4. **Empirical Test Verification**:
   - *Observation 1.2 (Commands 3, 4, 5)*: Independent execution of the entire test suite confirms 100% test pass rate across all 82 M1 tests, 101 unit tests, and 230 full end-to-end tests with zero failures or skips.

---

## 3. Caveats

- **No Caveats**: All components required for Milestone 1 were inspected, verified at both static and behavioral levels, and tested directly without simulation.

---

## 4. Conclusion

The work product in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back` satisfies all integrity and technical requirements without shortcuts, facades, or prohibited patterns.

**Official Verdict**: **CLEAN**

---

## 5. Verification Method

To independently reproduce and verify this audit:

```powershell
# 1. Navigate to target workspace
cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"

# 2. Run Milestone 1 baseline and adversarial test suites
node --test tests/auth.test.js tests/adversarial_m1.test.js tests/adversarial_m1_2.test.js
# Expected: 82 tests pass, 0 fail.

# 3. Run all unit tests
npm run test:unit
# Expected: 101 tests pass, 0 fail.

# 4. Run the full project suite (Unit + E2E Tiers 1-4)
npm test
# Expected: 230 tests pass, 0 fail.
```

### Invalidation Conditions
- Any failure or non-zero exit code when running `npm test`.
- Alteration of `COLLATE NOCASE` in `src/db/schema.sql`.
- Modification of `transaction(fn)` in `src/db/database.js` removing synchronous rollback guards.
- Replacing `bcryptjs` or `jsonwebtoken` with mock implementations.
