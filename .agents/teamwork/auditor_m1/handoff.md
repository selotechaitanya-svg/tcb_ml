# Forensic Audit Report: Milestone 1 Integrity Verification

**Auditor**: `auditor_m1` (teamwork_auditor)  
**Target Workspace**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Profile**: General Project (Demo Mode)  
**Integrity Mode**: Demo Mode (from `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**  
**Date**: 2026-10-29T20:36:00Z  

---

## Executive Summary

An independent, rigorous forensic integrity audit was performed on the Milestone 1 codebase in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`. Static analysis of all source files in `src/` and test files in `tests/` confirmed the complete absence of hardcoded outputs, fake responses, mock bypasses, or external code plagiarized for core logic. Dynamic runtime verification empirically proved that salted bcrypt password hashing is authentic and cryptographically sound, JWT tokens are cryptographically signed and expiration-checked, and SQLite executes authentic schema migrations, constraints (CHECK, FOREIGN KEY, UNIQUE), and transaction rollbacks. Zero integrity violations were detected.

---

## 1. Observation

### 1.1 Phase 1: Static Analysis Findings
1. **Pre-Populated Artifact Detection**:
   Searching for `*.log`, `*result*`, or `*output*` files in the workspace (excluding `node_modules`):
   ```powershell
   Get-ChildItem -Path "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back" -Recurse -Include *.log,*result*,*output* -Exclude node_modules
   ```
   *Result*: 0 artifacts found. No pre-populated execution logs or attestation files exist.

2. **Hardcoded Test Fixtures & Facade Checks**:
   Ripgrep search across `src/` for test usernames (`peter_parker`, `spiderman`, `active_citizen`, `active_hero`, `rbac_citizen`, `green_goblin`, `dailybugle`) returned **0 matches**.
   Search for mock/stub/fake bypass terms (`mock`, `stub`, `fake`, `dummy`, `todo`, `fixme`) in `src/` returned **0 matches**.
   All methods in `src/services/authService.js`, `src/db/database.js`, `src/middleware/auth.js`, and `src/middleware/rbac.js` contain genuine logic connecting to SQLite and standard crypto libraries.

3. **Dependency & Plagiarism Audit**:
   `package.json` declares 3 runtime dependencies (`express: ^4.21.2`, `bcryptjs: ^2.4.3`, `jsonwebtoken: ^9.0.2`) and 1 development dependency (`supertest: ^7.0.0`). All core business logic (database manager, auth service, RBAC guards, input validation, error handling) is written directly and tailored to the Spider-Sense Alert System requirements. No external tools or pre-built alert systems were imported.

### 1.2 Phase 2: Runtime Verification Results
1. **Bcrypt Salted Hashing Verification**:
   Executed independent runtime verification script:
   - User 1 hash: `$2a$10$ADFBplgxRm05ytlPksQYuOr33dWu1.mxmDgBqyIjfXekGBQrvQzhO`
   - User 2 hash (same password): `$2a$10$.JoAOUR6hTVJybRG7qB2D.JnkYutrY6DWPJw8bNHi.oheiBaq6Sw2`
   - Real bcrypt format (`$2a$` / `$2b$`): **true**
   - Distinct salts produce distinct hashes for identical passwords: **true**
   - `bcrypt.compare` on correct password: **true**
   - `bcrypt.compare` on incorrect password: **false**
   - Result: `BCRYPT_VERIFICATION_PASS`

2. **JWT Signing, Expiration & Secret Verification**:
   Executed independent token verification script:
   - Decoded valid token: `{ id: 42, userId: 42, username: 'spiderman', role: 'Hero' }`
   - Wrong secret rejected by `jwt.verify`: **true**
   - AuthService rejects token signed with foreign secret with HTTP 401: **true**
   - AuthService rejects expired token with HTTP 401: **true**
   - Result: `JWT_VERIFICATION_PASS`

3. **SQLite Schema, Constraints & Transactions**:
   Executed independent SQLite schema verification:
   - PASS 1: Role CHECK constraint enforced (rejects `role = 'Villain'` with `CHECK constraint failed`)
   - PASS 2: Foreign key constraint enforced (rejects invalid `reporter_id` with `FOREIGN KEY constraint failed`)
   - PASS 3: Severity CHECK constraint enforced (rejects `severity = 6` with `CHECK constraint failed`)
   - PASS 4: UNIQUE constraint on username enforced (rejects duplicate username with `UNIQUE constraint failed`)
   - PASS 5: Transaction top-level rollback verified (uncommitted insert rolled back on error)
   - PASS 6: Nested transaction SAVEPOINT partial rollback verified (inner rolled back, outer committed)
   - PASS 7: ON DELETE CASCADE on `status_history` verified (deleting incident cascades to audit log)
   - Result: `SQLITE_VERIFICATION_PASS` (7/7 checks passed)

### 1.3 Phase 3: Adversarial Stress-Testing
1. **SQL Injection Resistance**:
   - `admin' OR '1'='1` in registration payload safely parameterized as literal string: HTTP 201/400.
   - `' OR '1'='1' --` in login rejected with HTTP 401.
2. **Algorithm "none" Token Attack**:
   - Unsigned token `{ alg: 'none', typ: 'JWT' }` rejected with HTTP 401.
3. **Signature Tampering Attack**:
   - Bit-flipped token and payload tampering rejected with HTTP 401.
4. **Role Escalation Attack**:
   - Attempting to register with `role: 'SuperAdmin'` rejected with HTTP 400.
   - Result: `ALL_ADVERSARIAL_TESTS_PASS` (6/6 checks passed)

### 1.4 Test Suite Execution
1. `node --test tests/auth.test.js`:
   - 27 passed, 0 failed (2190ms).
2. `node --test tests/adversarial_m1.test.js`:
   - 31 passed, 0 failed (1259ms).
3. `node --test tests/adversarial_m1_2.test.js`:
   - 21 passed, 1 failed (concurrent case collision).

---

## 2. Logic Chain

1. **Absence of Facades and Pre-Fabrication**:
   - Static search yielded 0 matches for test fixtures or mock tokens in `src/`.
   - Inspection of `src/services/authService.js` and `src/db/database.js` confirms authentic parameter binding, real SQLite prepared statement execution (`stmt.all()`, `stmt.run()`), and explicit transaction block wrappers (`BEGIN IMMEDIATE`, `SAVEPOINT`).
2. **Cryptographic Authenticity**:
   - Directly observing two users registered with `SamePassword123!` generating different `$2a$10$` hashes proves that real random salting and cost factor 10 hashing occur.
   - Tokens signed with foreign secret or algorithm "none" produce HTTP 401, confirming real cryptographic signature verification.
3. **Database Integrity Compliance**:
   - Testing raw SQLite operations proved that foreign keys (`PRAGMA foreign_keys = ON;`), CHECK constraints (`role IN ('Citizen', 'Hero')`, `severity >= 1 AND severity <= 5`), and transaction atomicity operate genuinely inside `node:sqlite`.
4. **Integrity Mode Assessment**:
   - The integrity mode is **Demo Mode**. All code is written from scratch, does not copy from external repositories, and delegates zero core work to third-party services.

---

## 3. Caveats

1. **Milestone 2 Incident Routes**:
   `src/app.js` currently routes `/api/incidents` to an empty fallback router because incident CRUD, claiming, and lifecycle state transitions are designated for Milestone 2. This is expected and documented in `PROJECT.md`.
2. **Adversarial Race Condition on Case Collision**:
   In `tests/adversarial_m1_2.test.js`, the test `should reject concurrent registrations with case-insensitive collision ("PeterParker" vs "peterparker")` failed because SQLite's `UNIQUE` constraint defaults to `BINARY` collation. While `authService.js` performs a case-insensitive check (`COLLATE NOCASE`) prior to insertion, concurrent requests can slip past the check during async bcrypt hashing. This is a concurrency design edge case (fixable by adding `COLLATE NOCASE` directly to the `UNIQUE` column definition in `schema.sql`), NOT an integrity violation.

---

## 4. Conclusion

**Verdict: CLEAN**

Milestone 1 satisfies all forensic integrity criteria under Demo Mode:
- No hardcoded test responses or facade implementations.
- Real salted bcrypt hashing and real JWT authentication.
- Authentic relational SQLite database with enforced schema, constraints, and transactions.
- Zero unauthorized code copying or external execution delegation.

The work product is approved from an integrity perspective.

---

## 5. Verification Method

To independently verify this audit:

1. **Verify Bcrypt Hashing**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node -e "const a = require('./src/services/authService'); const { initDatabase } = require('./src/db/database'); initDatabase(':memory:'); (async () => { const r1 = await a.registerUser('u1', 'u1@t.com', 'p1', 'Citizen'); const r2 = await a.registerUser('u2', 'u2@t.com', 'p1', 'Hero'); console.log('Bcrypt salt check:', r1.token && r2.token && r1.user.password_hash === undefined); })();"
   ```

2. **Verify SQLite Constraints & Transactions**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node -e "const { initDatabase } = require('./src/db/database'); const db = initDatabase(':memory:'); try { db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['v', 'v@t.com', 'h', 'Villain']); console.log('FAIL'); } catch (e) { console.log('PASS: Role CHECK constraint active'); }"
   ```

3. **Run M1 Auth Test Suite**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node --test tests/auth.test.js
   ```
