# Investigation & DDL Architecture Handoff Report: Case-Insensitive Uniqueness & Concurrency Safety

**Agent**: `explorer_m1_r2_1` (teamwork_explorer)  
**Parent Orchestrator ID**: `1f711568-1661-45be-898c-803cc58f3f36`  
**Working Directory**: `c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\`  
**Target Workspace**: `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`  
**Date**: 2026-10-29T20:47:00Z  
**Type**: Hard Handoff  

---

## 1. Observation

### 1.1 Direct Inspection of Target Files

1. **`src/db/schema.sql` (lines 5–13, 41–43)**:
   ```sql
   5: CREATE TABLE IF NOT EXISTS users (
   6:   id INTEGER PRIMARY KEY AUTOINCREMENT,
   7:   username TEXT NOT NULL UNIQUE COLLATE NOCASE,
   8:   email TEXT NOT NULL UNIQUE COLLATE NOCASE,
   9:   password_hash TEXT NOT NULL,
   10:   role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
   11:   created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
   12:   updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
   13: );
   ...
   41: -- Indexes for Fast Lookups, Authentication, Filtering & Pagination
   42: CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
   43: CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
   ```

2. **`src/services/authService.js` (lines 20–54)**:
   ```javascript
   20:     const validated = validateRegisterPayload({ username, email, password, role });
   21: 
   22:     // Check unique constraints (case-insensitive)
   23:     const existingUser = get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [validated.username]);
   24:     if (existingUser) {
   25:       throw new ConflictError('Username already in use');
   26:     }
   27: 
   28:     const existingEmail = get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [validated.email]);
   29:     if (existingEmail) {
   30:       throw new ConflictError('Email already in use');
   31:     }
   32: 
   33:     // Hash password
   34:     const passwordHash = await bcrypt.hash(validated.password, config.bcryptSaltRounds);
   35: 
   36:     // Insert user
   37:     let insertResult;
   38:     try {
   39:       insertResult = run(
   40:         'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
   41:         [validated.username, validated.email, passwordHash, validated.role]
   42:       );
   43:     } catch (err) {
   44:       if (err.code === 'ERR_SQLITE_ERROR' && err.message && err.message.includes('UNIQUE constraint failed')) {
   45:         if (err.message.includes('users.username')) {
   46:           throw new ConflictError('Username already in use');
   47:         }
   48:         if (err.message.includes('users.email')) {
   49:           throw new ConflictError('Email already in use');
   50:         }
   51:         throw new ConflictError('Username or email already in use');
   52:       }
   53:       throw err;
   54:     }
   ```

3. **`src/utils/errors.js` (lines 64–68)**:
   ```javascript
   64: class ConflictError extends AppError {
   65:   constructor(message = 'Conflict') {
   66:     super(message, 409);
   67:   }
   68: }
   ```

4. **`src/middleware/errorHandler.js` (lines 8–27)**:
   ```javascript
   8: function errorHandler(err, req, res, next) {
   ...
   13:   let statusCode = err.statusCode || 500;
   14:   let message = err.message || 'Internal Server Error';
   ...
   22:   // Handle SQLite unique constraint conflicts if uncaught in service
   23:   if (err.code === 'ERR_SQLITE_ERROR' && err.message && err.message.includes('UNIQUE constraint failed')) {
   24:     statusCode = 409;
   25:     message = 'A record with the given unique identifier already exists';
   26:   }
   ...
   38:   res.status(statusCode).json({
   39:     error: message
   40:   });
   41: }
   ```

### 1.2 Empirical Defect Reproduction (Without `COLLATE NOCASE`)

Executed reproduction script `verify_ddl_and_error_mapping.js` on a schema lacking `COLLATE NOCASE` (`username TEXT NOT NULL UNIQUE`):
- Inserting `'PeterParker'` followed by `'peterparker'`:
  - **Result**: Both inserts succeeded. `SELECT id, username FROM users` returned:
    ```json
    [
      { "id": 1, "username": "PeterParker" },
      { "id": 2, "username": "peterparker" }
    ]
    ```
- Verbatim tool output:
  `Under binary collation, duplicate case-variant was allowed: true`

### 1.3 Empirical Fix Verification (With `COLLATE NOCASE`)

Executed same reproduction script on schema with `COLLATE NOCASE`:
- Inserting `'PeterParker'` followed by `'peterparker'`:
  - **Result**: Throws error.
  - Verbatim error code: `ERR_SQLITE_ERROR`
  - Verbatim error message: `UNIQUE constraint failed: users_fixed.username`
- Inserting `'peter@test.com'` followed by `'PETER@TEST.COM'`:
  - **Result**: Throws error.
  - Verbatim error code: `ERR_SQLITE_ERROR`
  - Verbatim error message: `UNIQUE constraint failed: users_fixed.email`

### 1.4 SQLite Index Metadata & Query Plan Inspection

Inspected index metadata using `PRAGMA index_list` and `PRAGMA index_xinfo`:
- For table `users`:
  - Index `sqlite_autoindex_users_1`: `"cid": 1, "name": "username", "coll": "NOCASE", "unique": 1`
  - Index `sqlite_autoindex_users_2`: `"cid": 2, "name": "email", "coll": "NOCASE", "unique": 1`
  - Index `idx_users_username`: `"cid": 1, "name": "username", "coll": "NOCASE", "unique": 0`
- Query Plan for `EXPLAIN QUERY PLAN SELECT id FROM users WHERE username = ? COLLATE NOCASE`:
  - Detail: `SEARCH users USING COVERING INDEX sqlite_autoindex_users_1 (username=?)`

### 1.5 End-to-End Concurrent HTTP Verification

Executed concurrent HTTP requests via `supertest` against Express app:
- Request 1: `POST /api/auth/register` with `username: "GwenStacyCase"`
- Request 2: `POST /api/auth/register` with `username: "gwenstacycase"`
- **Verbatim Results**:
  - Response statuses: `[ 201, 409 ]`
  - Request 1 Body (201): `{ message: "User registered successfully", user: { id: 2, username: "GwenStacyCase", ... }, token: "..." }`
  - Request 2 Body (409): `{ error: "Username already in use" }`
  - Database verification: Exactly 1 row persisted in table `users`.

### 1.6 Full Unit Test Suite Execution

Executed in `C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back`:
`npm run test:unit`
- **Verbatim Result**:
  `tests 95 | suites 21 | pass 95 | fail 0 | cancelled 0 | skipped 0 | todo 0 | duration_ms 2370.5819`
  Exit code: `0`.

---

## 2. Logic Chain

1. **TOCTOU Race Condition Root Cause**:
   - In `authService.js` lines 23–34, an application-level existence check is performed (`SELECT id FROM users WHERE username = ? COLLATE NOCASE`), followed by an asynchronous bcrypt password hash (`await bcrypt.hash(..., 10)`).
   - Because `bcrypt.hash` takes 50–100ms and yields to the Node.js event loop, concurrent incoming requests for `PeterParker` and `peterparker` both execute the `SELECT` before either request reaches the `INSERT` statement. Both see 0 matching rows and proceed to insert.
2. **SQLite Binary Collation Vulnerability**:
   - In standard SQLite DDL, `username TEXT NOT NULL UNIQUE` uses SQLite's default `BINARY` collation sequence. Under binary collation, `'PeterParker' != 'peterparker'` (ASCII 0x50 != 0x70). SQLite's B-tree index considers them distinct values and permits both inserts (Observation 1.2).
   - This leads to account shadowing and permanent denial of service: when user 2 attempts to log in, `SELECT ... WHERE username = ? COLLATE NOCASE` returns user 1, and user 2's password is evaluated against user 1's hash, causing login failure with HTTP 401.
3. **Database-Level Collation Remediation**:
   - Adding `COLLATE NOCASE` directly to the column definition:
     `username TEXT NOT NULL UNIQUE COLLATE NOCASE,`
     `email TEXT NOT NULL UNIQUE COLLATE NOCASE,`
     instructs SQLite's internal index creation engine to build the unique index (`sqlite_autoindex_users_1`) using case-insensitive ASCII folding (Observation 1.4).
   - When the second concurrent request attempts to insert, SQLite detects the collation collision and throws native `ERR_SQLITE_ERROR: UNIQUE constraint failed: users.username` (Observation 1.3).
4. **Error Catching and HTTP 409 Mapping**:
   - In `authService.js` line 44, the catch block intercepts this exact error:
     `if (err.code === 'ERR_SQLITE_ERROR' && err.message && err.message.includes('UNIQUE constraint failed'))`
   - Lines 45–50 detect that `users.username` caused the collision and throw `new ConflictError('Username already in use')`.
   - `ConflictError` sets `statusCode = 409` (Observation 1.1 item 3).
   - `errorHandler.js` line 13 reads `err.statusCode = 409` and sends HTTP 409 with `{ error: 'Username already in use' }` (Observation 1.1 item 4 and Observation 1.5).
5. **Index DDL Precision**:
   - Updating `idx_users_username` from:
     `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`
     to:
     `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);`
     (and similarly for `idx_users_email ON users(email COLLATE NOCASE);`) guarantees explicit NOCASE collation in the index schema definition, matching SQLite best practices and ensuring consistent behavior across DDL tooling.

---

## 3. Caveats

1. **ASCII Case Insensitivity Scope**: SQLite's `NOCASE` collation applies to ASCII characters `A-Z` / `a-z`. Unicode non-ASCII casing (e.g. accented characters) uses binary collation unless custom collating sequences are registered. For the Spider-Sense application requirements (alphanumeric usernames), `COLLATE NOCASE` is fully sufficient.
2. **Pre-check Retention**: Retaining the application-level pre-check in `authService.js` remains desirable as a fast path for sequential registrations, avoiding unnecessary password hashing overhead when a duplicate username already exists.
3. **Milestone 2 Separation**: Milestone 2 incident routes and claiming concurrency are separate and do not alter the user authentication schema.

---

## 4. Conclusion

The exact DDL fix required in `src/db/schema.sql` is:

### Proposed Lines in `src/db/schema.sql`

```sql
-- 1. Users Table (Lines 5-13)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

...

-- Indexes (Lines 42-43)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);
```

### Artifacts Delivered in Working Directory

1. `proposed_schema.sql` (`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\proposed_schema.sql`): Complete verified schema definition.
2. `schema.patch` (`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\schema.patch`): Machine-applicable unified diff.
3. `verify_ddl_and_error_mapping.js` (`c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\verify_ddl_and_error_mapping.js`): Comprehensive 5-point verification suite.

---

## 5. Verification Method

To independently verify the DDL fix and error mapping:

1. **Run Full Unit & Adversarial Test Suite**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   npm run test:unit
   ```
   *Expected Output*: `95 tests passed, 0 failed`, exit code `0`.

2. **Run Milestone 1 Adversarial Suites**:
   ```powershell
   cd "C:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_back"
   node --test tests/adversarial_m1.test.js
   node --test tests/adversarial_m1_2.test.js
   ```
   *Expected Output*: Both test suites pass 100% (32/32 and 23/23 tests pass).

3. **Run Independent 5-Point Verification Script**:
   ```powershell
   node "c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\verify_ddl_and_error_mapping.js"
   ```
   *Expected Output*: Verifies defective behavior without fix, verifies native SQLite constraint error with fix, verifies index query plans, verifies `authService.js` ConflictError rethrow, and verifies end-to-end HTTP concurrent race resolution to `[201, 409]`.
