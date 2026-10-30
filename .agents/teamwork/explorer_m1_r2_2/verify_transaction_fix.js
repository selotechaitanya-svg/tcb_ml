'use strict';

const path = require('node:path');
const assert = require('node:assert');

// Test the exact proposed DatabaseManager implementation
const { DatabaseSync } = require('node:sqlite');

class ProposedDatabaseManager {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this._txDepth = 0;
    this.db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE
      );
    `);
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  /**
   * Executes a synchronous callback within an immediate transaction.
   * Supports nested invocations via SQLite SAVEPOINT.
   * Guards against asynchronous callbacks to prevent premature commits and concurrency hazard.
   * @template T
   * @param {function(ProposedDatabaseManager): T} fn
   * @returns {T}
   */
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

      // Guard: Detect if an async function or Promise/thenable was returned
      if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
        // Prevent unhandled promise rejection if the abandoned async callback rejects
        if (typeof result.catch === 'function') {
          result.catch(() => {});
        }

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
}

async function verifyProposedImplementation() {
  const dbManager = new ProposedDatabaseManager();

  // Test 1: Standard synchronous transaction commit
  const r1 = dbManager.transaction((db) => {
    db.run('INSERT INTO users (username) VALUES (?)', ['user1']);
    return 'ok1';
  });
  assert.strictEqual(r1, 'ok1');
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['user1']).username, 'user1');
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 1 Passed: Synchronous transaction commits properly.');

  // Test 2: Synchronous error rollback
  let errCaught = false;
  try {
    dbManager.transaction((db) => {
      db.run('INSERT INTO users (username) VALUES (?)', ['user2']);
      throw new Error('Sync failure');
    });
  } catch (err) {
    errCaught = true;
    assert.strictEqual(err.message, 'Sync failure');
  }
  assert.strictEqual(errCaught, true);
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['user2']), undefined);
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 2 Passed: Synchronous error rolls back completely.');

  // Test 3: Nested savepoints
  dbManager.transaction((outerDb) => {
    outerDb.run('INSERT INTO users (username) VALUES (?)', ['outer_user']);
    try {
      outerDb.transaction((innerDb) => {
        innerDb.run('INSERT INTO users (username) VALUES (?)', ['inner_user']);
        throw new Error('Inner failure');
      });
    } catch (_) {}
  });
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['outer_user']).username, 'outer_user');
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['inner_user']), undefined);
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 3 Passed: Nested savepoints roll back isolated inner without breaking outer.');

  // Test 4: Async callback is rejected, rolled back, and depth restored
  let committedPrematurely = false;
  let asyncErrorCaught = false;
  try {
    await dbManager.transaction(async (db) => {
      db.run('INSERT INTO users (username) VALUES (?)', ['async_user']);
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('Simulated async failure after insert');
    });
  } catch (err) {
    asyncErrorCaught = true;
    assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
    const u = dbManager.get('SELECT id FROM users WHERE username = ?', ['async_user']);
    if (u) {
      committedPrematurely = true;
    }
  }
  assert.strictEqual(asyncErrorCaught, true);
  assert.strictEqual(committedPrematurely, false);
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 4 Passed: Async callback triggers immediate rollback and informative error.');

  // Test 5: Verify no subsequent transaction is poisoned
  dbManager.transaction((db) => {
    db.run('INSERT INTO users (username) VALUES (?)', ['user_after_async']);
  });
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['user_after_async']).username, 'user_after_async');
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 5 Passed: Subsequent transaction works cleanly without transaction state poisoning.');

  // Test 6: Nested transaction receiving async callback
  let nestedAsyncCaught = false;
  dbManager.transaction((outerDb) => {
    outerDb.run('INSERT INTO users (username) VALUES (?)', ['outer_ok']);
    try {
      outerDb.transaction(async (innerDb) => {
        innerDb.run('INSERT INTO users (username) VALUES (?)', ['inner_async']);
        await Promise.resolve();
      });
    } catch (err) {
      nestedAsyncCaught = true;
      assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
    }
  });
  assert.strictEqual(nestedAsyncCaught, true);
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['outer_ok']).username, 'outer_ok');
  assert.strictEqual(dbManager.get('SELECT username FROM users WHERE username = ?', ['inner_async']), undefined);
  assert.strictEqual(dbManager._txDepth, 0);
  console.log('Test 6 Passed: Nested async callback rolls back savepoint and does not corrupt outer transaction.');

  console.log('\nAll 6 verification checks passed successfully!');
}

verifyProposedImplementation().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
