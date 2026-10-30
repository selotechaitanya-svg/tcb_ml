# BRIEFING — 2026-10-29T20:45:00Z

## Mission
Investigate and design the exact DDL fix in `src/db/schema.sql` (adding `COLLATE NOCASE` to `users.username`, `users.email`, and updating `idx_users_username`), and verify SQLite case-insensitive uniqueness behavior and `authService.js` error handling (HTTP 409 mapping).

## 🔒 My Identity
- Archetype: explorer
- Roles: Teamwork explorer (read-only investigation, synthesis, structured reports)
- Working directory: c:\Users\CHAITANYA SELOTE\OneDrive\Desktop\tcb_ml\.agents\teamwork\explorer_m1_r2_1\
- Original parent: 1f711568-1661-45be-898c-803cc58f3f36
- Milestone: Milestone 1 Iteration 2 (m1_r2)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in `tcb_back` (provide proposed changes / diff in handoff)
- Adhere to Gravitas invariants (Ground before mutating, Stay in declared scope, Evidence-backed verification, Never exact-retry a failure, Satisfy acceptance criteria, Say what you cannot verify)
- Strict workspace convention: write only to working directory

## Current Parent
- Conversation ID: 1f711568-1661-45be-898c-803cc58f3f36
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `src/db/schema.sql` (DDL definition for `users`, `incidents`, `status_history`, indexes, triggers)
  - `src/services/authService.js` (registration TOCTOU window, SQLite error catching, `ConflictError` rethrow)
  - `src/controllers/authController.js` and `src/middleware/errorHandler.js` (HTTP 409 JSON response)
  - `src/utils/errors.js` (`ConflictError` extending `AppError` with `statusCode = 409`)
  - `tests/adversarial_m1.test.js` and `tests/adversarial_m1_2.test.js` (empirical concurrency test suites)
- **Key findings**:
  - SQLite default collation on `TEXT UNIQUE` is `BINARY`. Under concurrent bursts, async bcrypt hashing (~50-100ms) allows case-variant requests (`PeterParker` vs `peterparker`) to bypass `SELECT` pre-checks and insert colliding accounts, causing account shadowing/lockout.
  - Adding `COLLATE NOCASE` to column definition (`username TEXT NOT NULL UNIQUE COLLATE NOCASE`) configures SQLite's native autoindex `sqlite_autoindex_users_1` with `NOCASE` collation, throwing `ERR_SQLITE_ERROR: UNIQUE constraint failed: users.username`.
  - Adding `COLLATE NOCASE` to `idx_users_username` (`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);`) makes the collation explicit in DDL metadata and index definitions.
  - `authService.js` lines 43-54 catch `ERR_SQLITE_ERROR` with `UNIQUE constraint failed`, inspect `users.username`/`users.email`, and throw `ConflictError` (HTTP 409).
  - All 5 empirical verification tests pass, and `npm run test:unit` passes 95/95 tests.
- **Unexplored areas**: Milestone 2 incident lifecycle state transitions and hero claim concurrency (future milestone scope).

## Key Decisions Made
- Designed exact DDL fix in `src/db/schema.sql`: lines 7, 8, 42, 43.
- Produced `proposed_schema.sql` and `schema.patch`.
- Validated SQLite query planner uses covering autoindex with `COLLATE NOCASE`.

## Artifact Index
- `DISPATCH.md` — Inbound instructions log
- `BRIEFING.md` — Persistent situational awareness
- `progress.md` — Liveness heartbeat
- `test_sqlite_collation.js` — SQLite index inspection & collation script
- `test_index_compare.js` — Index definition comparison script
- `verify_ddl_and_error_mapping.js` — Comprehensive 5-point verification suite
- `proposed_schema.sql` — Full replacement DDL file
- `schema.patch` — Unified diff patch for `schema.sql`
- `handoff.md` — Final 5-component handoff report
