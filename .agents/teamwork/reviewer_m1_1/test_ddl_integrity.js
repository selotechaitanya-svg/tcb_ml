'use strict';

const assert = require('node:assert');
const { DatabaseManager } = require('C:/Users/CHAITANYA SELOTE/OneDrive/Desktop/tcb_back/src/db/database.js');

const db = new DatabaseManager(':memory:');

console.log('--- 1. Testing PRAGMA foreign_keys ---');
const fkPragma = db.get('PRAGMA foreign_keys;');
console.log('PRAGMA foreign_keys result:', fkPragma);
const fkVal = Object.values(fkPragma)[0];
assert.strictEqual(fkVal, 1, 'foreign_keys pragma must be enabled (1)');

console.log('--- 2. Testing CHECK Constraints on users table ---');
assert.throws(() => {
  db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['bad', 'bad@test.com', 'hash', 'Villain']);
}, /CHECK constraint failed/i, 'Users role must enforce CHECK constraint');

const u1 = db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['cit1', 'c1@test.com', 'hash', 'Citizen']);
const citizenId = u1.lastInsertRowid;
const u2 = db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['hero1', 'h1@test.com', 'hash', 'Hero']);
const heroId = u2.lastInsertRowid;

console.log('--- 3. Testing CHECK Constraints on incidents table ---');
assert.throws(() => {
  db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id) VALUES (?, ?, ?, ?, ?, ?)',
    ['T', 'D', 'Theft', 0, 'Queens', citizenId]);
}, /CHECK constraint failed/i, 'Severity 0 must fail');

assert.throws(() => {
  db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id) VALUES (?, ?, ?, ?, ?, ?)',
    ['T', 'D', 'Theft', 6, 'Queens', citizenId]);
}, /CHECK constraint failed/i, 'Severity 6 must fail');

assert.throws(() => {
  db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['T', 'D', 'Theft', 3, 'Queens', citizenId, 'InvalidStatus']);
}, /CHECK constraint failed/i, 'Invalid status must fail');

console.log('--- 4. Testing Foreign Key Violation on reporter_id ---');
assert.throws(() => {
  db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id) VALUES (?, ?, ?, ?, ?, ?)',
    ['T', 'D', 'Theft', 3, 'Queens', 99999]);
}, /FOREIGN KEY constraint failed/i, 'Non-existent reporter_id must fail');

const incRes = db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id) VALUES (?, ?, ?, ?, ?, ?)',
  ['Bank Robbery', 'Armed robbery at 5th ave', 'Robbery', 4, 'Midtown', citizenId]);
const incidentId = incRes.lastInsertRowid;

console.log('--- 5. Testing status_history table constraints ---');
db.run('INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id) VALUES (?, ?, ?, ?)',
  [incidentId, null, 'Reported', citizenId]);

assert.throws(() => {
  db.run('INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id) VALUES (?, ?, ?, ?)',
    [incidentId, 'Invalid', 'Reported', citizenId]);
}, /CHECK constraint failed/i, 'Invalid previous_status must fail');

assert.throws(() => {
  db.run('INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id) VALUES (?, ?, ?, ?)',
    [incidentId, 'Reported', 'Invalid', citizenId]);
}, /CHECK constraint failed/i, 'Invalid new_status must fail');

console.log('--- 6. Testing ON DELETE RESTRICT on users ---');
assert.throws(() => {
  db.run('DELETE FROM users WHERE id = ?', [citizenId]);
}, /FOREIGN KEY constraint failed/i, 'Deleting referenced reporter user must be RESTRICTED');

console.log('--- 7. Testing ON DELETE CASCADE on status_history ---');
const countBefore = db.get('SELECT count(*) as count FROM status_history WHERE incident_id = ?', [incidentId]).count;
assert.strictEqual(countBefore, 1);
db.run('DELETE FROM incidents WHERE id = ?', [incidentId]);
const countAfter = db.get('SELECT count(*) as count FROM status_history WHERE incident_id = ?', [incidentId]).count;
assert.strictEqual(countAfter, 0, 'status_history records must be deleted via ON DELETE CASCADE');

// Now citizen has no referencing records; deleting citizen should succeed
db.run('DELETE FROM users WHERE id = ?', [citizenId]);
console.log('ON DELETE CASCADE & ON DELETE RESTRICT successfully passed!');

console.log('--- 8. Testing ON DELETE SET NULL on hero_id ---');
const cit2 = db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['cit2', 'c2@test.com', 'hash', 'Citizen']);
const cit2Id = cit2.lastInsertRowid;
const inc2 = db.run('INSERT INTO incidents (title, description, category, severity, location, reporter_id, hero_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ['Fire', 'Fire in Queens', 'Fire', 2, 'Queens', cit2Id, heroId, 'Claimed']);
const inc2Id = inc2.lastInsertRowid;

db.run('DELETE FROM users WHERE id = ?', [heroId]);
const inc2After = db.get('SELECT hero_id FROM incidents WHERE id = ?', [inc2Id]);
assert.strictEqual(inc2After.hero_id, null, 'hero_id must become NULL on hero user deletion');
console.log('ON DELETE SET NULL successfully passed!');

console.log('--- 9. Testing Indexes in SQLite Master ---');
const indexes = db.query("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL");
console.log('Created indexes:', indexes.map(i => `${i.tbl_name}.${i.name}`));
assert.ok(indexes.some(i => i.name === 'idx_users_username'));
assert.ok(indexes.some(i => i.name === 'idx_users_email'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_reporter'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_hero'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_status'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_category'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_severity'));
assert.ok(indexes.some(i => i.name === 'idx_incidents_created_at'));
assert.ok(indexes.some(i => i.name === 'idx_status_history_incident'));
assert.ok(indexes.some(i => i.name === 'idx_status_history_user'));

console.log('--- 10. Testing Transaction Rollback & Savepoints ---');
assert.throws(() => {
  db.transaction(() => {
    db.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['tx_u', 'tx@test.com', 'hash', 'Citizen']);
    throw new Error('Force rollback');
  });
}, /Force rollback/);
const txUser = db.get('SELECT * FROM users WHERE username = ?', ['tx_u']);
assert.strictEqual(txUser, undefined, 'Transaction rollback must revert inserts');

// Nested savepoint test
db.transaction((txDb) => {
  txDb.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['outer_u', 'outer@test.com', 'hash', 'Citizen']);
  try {
    txDb.transaction(() => {
      txDb.run('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)', ['inner_u', 'inner@test.com', 'hash', 'Citizen']);
      throw new Error('Inner rollback');
    });
  } catch (e) {
    // caught inner
  }
});
const outerUser = db.get('SELECT * FROM users WHERE username = ?', ['outer_u']);
const innerUser = db.get('SELECT * FROM users WHERE username = ?', ['inner_u']);
assert.ok(outerUser, 'Outer transaction commit must persist');
assert.strictEqual(innerUser, undefined, 'Inner savepoint rollback must revert inner insert only');
console.log('Transactions and savepoints verified successfully!');

console.log('\n========================================');
console.log('ALL VERIFICATION & ADVERSARIAL STRESS TESTS PASSED!');
console.log('========================================');
