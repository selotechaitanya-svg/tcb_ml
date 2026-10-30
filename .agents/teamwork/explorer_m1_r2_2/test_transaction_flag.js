'use strict';

const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert');

class DatabaseManagerWithFlag {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this._txDepth = 0;
    this.db.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        val TEXT NOT NULL
      );
    `);
  }

  run(sql, params = []) {
    return this.db.prepare(sql).run(...params);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

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
}

async function main() {
  const dm = new DatabaseManagerWithFlag();

  // 1. Sync success
  const res = dm.transaction((db) => {
    db.run('INSERT INTO test_table (val) VALUES (?)', ['val1']);
    return 42;
  });
  assert.strictEqual(res, 42);
  assert.strictEqual(dm.get('SELECT val FROM test_table WHERE val = ?', ['val1']).val, 'val1');
  assert.strictEqual(dm._txDepth, 0);

  // 2. Sync failure
  let caught = false;
  try {
    dm.transaction((db) => {
      db.run('INSERT INTO test_table (val) VALUES (?)', ['val2']);
      throw new Error('sync fail');
    });
  } catch (e) {
    caught = true;
    assert.strictEqual(e.message, 'sync fail');
  }
  assert.strictEqual(caught, true);
  assert.strictEqual(dm.get('SELECT val FROM test_table WHERE val = ?', ['val2']), undefined);
  assert.strictEqual(dm._txDepth, 0);

  // 3. Async failure
  let asyncCaught = false;
  let committed = false;
  try {
    await dm.transaction(async (db) => {
      db.run('INSERT INTO test_table (val) VALUES (?)', ['async_val']);
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('async fail');
    });
  } catch (e) {
    asyncCaught = true;
    assert.match(e.message, /DatabaseSync transaction\(\) callback must be synchronous/);
    if (dm.get('SELECT val FROM test_table WHERE val = ?', ['async_val'])) {
      committed = true;
    }
  }
  assert.strictEqual(asyncCaught, true);
  assert.strictEqual(committed, false);
  assert.strictEqual(dm._txDepth, 0);

  // 4. Async without error (e.g. resolve)
  let asyncResolveCaught = false;
  let resolvedCommitted = false;
  try {
    await dm.transaction(async (db) => {
      db.run('INSERT INTO test_table (val) VALUES (?)', ['async_resolve']);
      await new Promise((r) => setTimeout(r, 10));
      return 'done';
    });
  } catch (e) {
    asyncResolveCaught = true;
    assert.match(e.message, /DatabaseSync transaction\(\) callback must be synchronous/);
    if (dm.get('SELECT val FROM test_table WHERE val = ?', ['async_resolve'])) {
      resolvedCommitted = true;
    }
  }
  assert.strictEqual(asyncResolveCaught, true);
  assert.strictEqual(resolvedCommitted, false);
  assert.strictEqual(dm._txDepth, 0);

  // 5. Nested savepoint with async inner
  dm.transaction((outer) => {
    outer.run('INSERT INTO test_table (val) VALUES (?)', ['outer_val']);
    assert.throws(
      () => {
        outer.transaction(async (inner) => {
          inner.run('INSERT INTO test_table (val) VALUES (?)', ['inner_async']);
          await Promise.resolve();
        });
      },
      /DatabaseSync transaction\(\) callback must be synchronous/
    );
  });
  assert.strictEqual(dm.get('SELECT val FROM test_table WHERE val = ?', ['outer_val']).val, 'outer_val');
  assert.strictEqual(dm.get('SELECT val FROM test_table WHERE val = ?', ['inner_async']), undefined);
  assert.strictEqual(dm._txDepth, 0);

  console.log('All tests with rolledBack flag passed!');
}

main().catch(console.error);
