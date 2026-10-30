'use strict';

const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const workspacePath = 'C:/Users/CHAITANYA SELOTE/OneDrive/Desktop/tcb_back';
const request = require(path.join(workspacePath, 'node_modules/supertest'));
const app = require(path.join(workspacePath, 'src/app'));
const authService = require(path.join(workspacePath, 'src/services/authService'));
const { ConflictError } = require(path.join(workspacePath, 'src/utils/errors'));
const { setupTestDb, teardownTestDb, getDatabase } = require(path.join(workspacePath, 'tests/helpers/testDb'));

async function runVerification() {
  console.log('=== TEST 1: Demonstrating Defect Without COLLATE NOCASE ===');
  const dbDefective = new DatabaseSync(':memory:');
  dbDefective.exec(`
    CREATE TABLE users_defective (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  dbDefective.prepare("INSERT INTO users_defective (username, email, password_hash, role) VALUES ('PeterParker', 'p1@test.com', 'h1', 'Hero')").run();
  
  let duplicateAllowed = false;
  try {
    dbDefective.prepare("INSERT INTO users_defective (username, email, password_hash, role) VALUES ('peterparker', 'p2@test.com', 'h2', 'Hero')").run();
    duplicateAllowed = true;
  } catch (err) {
    duplicateAllowed = false;
  }
  console.log('Under binary collation, duplicate case-variant was allowed:', duplicateAllowed);
  assert.strictEqual(duplicateAllowed, true, 'Defect demonstration: binary collation permits duplicate case-variant username');

  const rows = dbDefective.prepare("SELECT id, username FROM users_defective").all();
  console.log('Persisted duplicate rows in defective schema:', rows);
  assert.strictEqual(rows.length, 2);

  console.log('\n=== TEST 2: Verifying Native SQLite Engine Behavior With COLLATE NOCASE ===');
  const dbFixed = new DatabaseSync(':memory:');
  dbFixed.exec(`
    CREATE TABLE users_fixed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  dbFixed.prepare("INSERT INTO users_fixed (username, email, password_hash, role) VALUES ('PeterParker', 'peter@test.com', 'h1', 'Hero')").run();

  let usernameError = null;
  try {
    dbFixed.prepare("INSERT INTO users_fixed (username, email, password_hash, role) VALUES ('peterparker', 'other@test.com', 'h2', 'Hero')").run();
  } catch (err) {
    usernameError = err;
  }
  console.log('Username duplicate error code:', usernameError.code);
  console.log('Username duplicate error message:', usernameError.message);
  assert.strictEqual(usernameError.code, 'ERR_SQLITE_ERROR');
  assert.match(usernameError.message, /UNIQUE constraint failed: users_fixed\.username/);

  let emailError = null;
  try {
    dbFixed.prepare("INSERT INTO users_fixed (username, email, password_hash, role) VALUES ('miles', 'PETER@TEST.COM', 'h3', 'Hero')").run();
  } catch (err) {
    emailError = err;
  }
  console.log('Email duplicate error code:', emailError.code);
  console.log('Email duplicate error message:', emailError.message);
  assert.strictEqual(emailError.code, 'ERR_SQLITE_ERROR');
  assert.match(emailError.message, /UNIQUE constraint failed: users_fixed\.email/);

  console.log('\n=== TEST 3: Verifying Index Def and Query Plans ===');
  dbFixed.exec(`
    CREATE INDEX idx_users_fixed_username ON users_fixed(username COLLATE NOCASE);
    CREATE INDEX idx_users_fixed_email ON users_fixed(email COLLATE NOCASE);
  `);

  const indexXInfo = dbFixed.prepare("PRAGMA index_xinfo('idx_users_fixed_username')").all();
  console.log('idx_users_fixed_username info:', indexXInfo);
  assert.strictEqual(indexXInfo[0].coll, 'NOCASE');

  const plan = dbFixed.prepare("EXPLAIN QUERY PLAN SELECT id FROM users_fixed WHERE username = ? COLLATE NOCASE").all('peterparker');
  console.log('Query plan for SELECT WHERE username = ? COLLATE NOCASE:', plan);

  console.log('\n=== TEST 4: Verifying authService.js Error Catching & HTTP 409 Mapping ===');
  setupTestDb();

  // Test sequential duplicate catch
  const user1 = await authService.registerUser('MilesMorales', 'miles@brooklyn.org', 'Pass123!', 'Hero');
  console.log('User 1 registered:', user1.user.username);

  let caughtServiceErr = null;
  try {
    await authService.registerUser('milesmorales', 'miles2@brooklyn.org', 'Pass123!', 'Hero');
  } catch (err) {
    caughtServiceErr = err;
  }
  console.log('Caught service error instance:', caughtServiceErr.constructor.name);
  console.log('Caught service error message:', caughtServiceErr.message);
  console.log('Caught service error statusCode:', caughtServiceErr.statusCode);
  assert.ok(caughtServiceErr instanceof ConflictError);
  assert.strictEqual(caughtServiceErr.statusCode, 409);
  assert.strictEqual(caughtServiceErr.message, 'Username already in use');

  console.log('\n=== TEST 5: Verifying Concurrent Race Condition Resolution via HTTP ===');
  const [res1, res2] = await Promise.all([
    request(app).post('/api/auth/register').send({
      username: 'GwenStacyCase',
      email: 'gwen1@spiderband.org',
      password: 'GhostSpider123!',
      role: 'Hero'
    }),
    request(app).post('/api/auth/register').send({
      username: 'gwenstacycase',
      email: 'gwen2@spiderband.org',
      password: 'GhostSpider123!',
      role: 'Hero'
    })
  ]);

  const statuses = [res1.status, res2.status].sort();
  console.log('Concurrent HTTP response statuses:', statuses);
  console.log('res1 status & body:', res1.status, res1.body);
  console.log('res2 status & body:', res2.status, res2.body);
  assert.deepStrictEqual(statuses, [201, 409]);

  const conflictRes = res1.status === 409 ? res1 : res2;
  const createdRes = res1.status === 201 ? res1 : res2;
  assert.strictEqual(conflictRes.body.error, 'Username already in use');
  assert.ok(createdRes.body.user);
  assert.ok(createdRes.body.token);

  // Verify only 1 row in database
  const db = getDatabase();
  const dbUsers = db.query("SELECT id, username, email FROM users WHERE username = 'GwenStacyCase' COLLATE NOCASE");
  console.log('Persisted users in database after race:', dbUsers);
  assert.strictEqual(dbUsers.length, 1);

  teardownTestDb();
  console.log('\n>>> ALL 5 TESTS PASSED WITH 100% SUCCESS! <<<');
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
