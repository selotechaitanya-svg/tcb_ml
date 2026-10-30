'use strict';

const assert = require('node:assert');
const { DatabaseManager } = require('C:/Users/CHAITANYA SELOTE/OneDrive/Desktop/tcb_back/src/db/database.js');

const db = new DatabaseManager(':memory:');

console.log('--- Adversarial Parameter Handling Stress Tests ---');

// Case 1: No params
const r1 = db.get('SELECT 1 as num');
assert.strictEqual(r1.num, 1);

// Case 2: Array of primitives
const r2 = db.get('SELECT ? as a, ? as b', ['alpha', 100]);
assert.strictEqual(r2.a, 'alpha');
assert.strictEqual(r2.b, 100);

// Case 3: Single element array
const r3 = db.get('SELECT ? as val', ['single']);
assert.strictEqual(r3.val, 'single');

// Case 4: Raw primitive without array
const r4 = db.get('SELECT ? as val', 'primitive');
assert.strictEqual(r4.val, 'primitive');

const r5 = db.get('SELECT ? as val', 999);
assert.strictEqual(r5.val, 999);

// Case 5: Named parameters with prefix
const r6 = db.get('SELECT :name as name, :score as score', { ':name': 'spidey', ':score': 10 });
assert.strictEqual(r6.name, 'spidey');
assert.strictEqual(r6.score, 10);

// Case 6: Named parameters with bare keys
const r7 = db.get('SELECT :name as name, :score as score', { name: 'spidey', score: 10 });
assert.strictEqual(r7.name, 'spidey');
assert.strictEqual(r7.score, 10);

// Case 7: Named parameters wrapped in array
const r8 = db.get('SELECT :name as name', [{ name: 'peter' }]);
assert.strictEqual(r8.name, 'peter');

// Case 8: Null and undefined params
const r9 = db.get('SELECT 100 as num', undefined);
assert.strictEqual(r9.num, 100);
const r10 = db.get('SELECT 200 as num', null);
assert.strictEqual(r10.num, 200);

// Case 9: Testing `query` method (stmt.all)
const q1 = db.query('SELECT 1 as x UNION ALL SELECT 2 as x');
assert.strictEqual(q1.length, 2);
assert.strictEqual(q1[0].x, 1);
assert.strictEqual(q1[1].x, 2);

const q2 = db.query('SELECT ? as x UNION ALL SELECT ? as x', [10, 20]);
assert.strictEqual(q2.length, 2);
assert.strictEqual(q2[0].x, 10);
assert.strictEqual(q2[1].x, 20);

// Case 10: Testing `run` method
db.exec('CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT, val INTEGER);');
const ins1 = db.run('INSERT INTO test_items (name, val) VALUES (?, ?)', ['item1', 42]);
assert.strictEqual(ins1.changes, 1);
assert.strictEqual(ins1.lastInsertRowid, 1);

const ins2 = db.run('INSERT INTO test_items (name, val) VALUES (:name, :val)', { name: 'item2', val: 84 });
assert.strictEqual(ins2.changes, 1);
assert.strictEqual(ins2.lastInsertRowid, 2);

const upd = db.run('UPDATE test_items SET val = val + 1 WHERE id = ?', 1);
assert.strictEqual(upd.changes, 1);

const checkUpd = db.get('SELECT val FROM test_items WHERE id = ?', 1);
assert.strictEqual(checkUpd.val, 43);

console.log('ALL ADVERSARIAL PARAMETER TESTS PASSED!');
