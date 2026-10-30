'use strict';

const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert');

class TestDb {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this._txDepth = 0;
    this.db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL
      );
    `);
  }

  transaction(fn) {
    const isTopLevel = this._txDepth === 0;
    const savepointName = `sp_${this._txDepth}`;
    this._txDepth++;

    if (isTopLevel) {
      this.db.exec('BEGIN IMMEDIATE;');
    } else {
      this.db.exec(`SAVEPOINT ${savepointName};`);
    }

    try {
      const result = fn(this);

      // Check if callback returned a Promise / thenable
      if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
        // Prevent unhandled promise rejection from the abandoned async callback
        result.catch(() => {});

        if (isTopLevel) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        }
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
      if (isTopLevel) {
        try {
          this.db.exec('ROLLBACK;');
        } catch (_) {}
      } else {
        try {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        } catch (_) {}
      }
      throw err;
    } finally {
      this._txDepth--;
    }
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }
}

async function runTests() {
  const db = new TestDb();

  console.log('--- Test 1: Synchronous success ---');
  db.transaction((tx) => {
    tx.run('INSERT INTO users (username) VALUES (?)', ['alice']);
  });
  assert.strictEqual(db.get('SELECT username FROM users WHERE username = ?', ['alice']).username, 'alice');
  console.log('Passed Test 1');

  console.log('--- Test 2: Synchronous error rollback ---');
  try {
    db.transaction((tx) => {
      tx.run('INSERT INTO users (username) VALUES (?)', ['bob']);
      throw new Error('boom');
    });
  } catch (e) {
    assert.strictEqual(e.message, 'boom');
  }
  assert.strictEqual(db.get('SELECT username FROM users WHERE username = ?', ['bob']), undefined);
  assert.strictEqual(db._txDepth, 0);
  console.log('Passed Test 2');

  console.log('--- Test 3: Adversarial test case (async function) ---');
  let committedPrematurely = false;
  try {
    await db.transaction(async (tx) => {
      tx.run('INSERT INTO users (username) VALUES (?)', ['async_user']);
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('Simulated async failure after insert');
    });
  } catch (err) {
    console.log('Caught expected error:', err.message);
    const u = db.get('SELECT id FROM users WHERE username = ?', ['async_user']);
    if (u) {
      committedPrematurely = true;
    }
  }

  assert.strictEqual(
    committedPrematurely,
    false,
    'Async callback inside transaction committed prematurely before error occurred!'
  );
  assert.strictEqual(db._txDepth, 0);
  console.log('Passed Test 3');

  // Wait 50ms to ensure no unhandledRejection is emitted
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log('--- Test 4: Nested synchronous savepoint ---');
  db.transaction((tx) => {
    tx.run('INSERT INTO users (username) VALUES (?)', ['outer']);
    try {
      tx.transaction((inner) => {
        inner.run('INSERT INTO users (username) VALUES (?)', ['inner_fail']);
        throw new Error('inner failed');
      });
    } catch (e) {
      // caught inner error
    }
    tx.run('INSERT INTO users (username) VALUES (?)', ['outer2']);
  });
  assert.strictEqual(db.get('SELECT username FROM users WHERE username = ?', ['outer']).username, 'outer');
  assert.strictEqual(db.get('SELECT username FROM users WHERE username = ?', ['outer2']).username, 'outer2');
  assert.strictEqual(db.get('SELECT username FROM users WHERE username = ?', ['inner_fail']), undefined);
  assert.strictEqual(db._txDepth, 0);
  console.log('Passed Test 4');

  console.log('ALL TESTS PASSED WITH CLEAN TERMINATION (EXIT CODE 0)!');
}

runTests().catch(console.error);
