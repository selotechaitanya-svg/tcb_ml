'use strict';

const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert');

class DatabaseManager {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this._txDepth = 0;
    this.db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
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

async function testAllCornerCases() {
  const dm = new DatabaseManager();

  // Case 1: fn returns null
  const r1 = dm.transaction((db) => {
    db.run('INSERT INTO items (name) VALUES (?)', ['null_val']);
    return null;
  });
  assert.strictEqual(r1, null);
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['null_val']).name, 'null_val');
  console.log('Case 1 Passed: returns null');

  // Case 2: fn returns primitive number/string/boolean
  const r2 = dm.transaction((db) => 123);
  assert.strictEqual(r2, 123);
  const r3 = dm.transaction((db) => 'hello');
  assert.strictEqual(r3, 'hello');
  const r4 = dm.transaction((db) => false);
  assert.strictEqual(r4, false);
  assert.strictEqual(dm._txDepth, 0);
  console.log('Case 2 Passed: returns primitives');

  // Case 3: fn returns object with non-function 'then' property
  const r5 = dm.transaction((db) => ({ then: 'not a function', foo: 'bar' }));
  assert.deepStrictEqual(r5, { then: 'not a function', foo: 'bar' });
  assert.strictEqual(dm._txDepth, 0);
  console.log('Case 3 Passed: returns object with non-function then property');

  // Case 4: fn returns Promise that rejects
  let caught4 = false;
  try {
    await dm.transaction(async (db) => {
      db.run('INSERT INTO items (name) VALUES (?)', ['async_reject']);
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('async rejected');
    });
  } catch (err) {
    caught4 = true;
    assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
  }
  assert.strictEqual(caught4, true);
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['async_reject']), undefined);
  console.log('Case 4 Passed: returns Promise that rejects (rolled back, error thrown)');

  // Case 5: fn returns Promise that resolves
  let caught5 = false;
  try {
    await dm.transaction(async (db) => {
      db.run('INSERT INTO items (name) VALUES (?)', ['async_resolve']);
      await new Promise((r) => setTimeout(r, 5));
      return 'done';
    });
  } catch (err) {
    caught5 = true;
    assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
  }
  assert.strictEqual(caught5, true);
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['async_resolve']), undefined);
  console.log('Case 5 Passed: returns Promise that resolves (rolled back, error thrown)');

  // Case 6: Nested transaction with async inner callback
  let caught6 = false;
  dm.transaction((outer) => {
    outer.run('INSERT INTO items (name) VALUES (?)', ['outer_item']);
    try {
      outer.transaction(async (inner) => {
        inner.run('INSERT INTO items (name) VALUES (?)', ['inner_item']);
        await Promise.resolve();
      });
    } catch (err) {
      caught6 = true;
      assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
    }
  });
  assert.strictEqual(caught6, true);
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['outer_item']).name, 'outer_item');
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['inner_item']), undefined);
  console.log('Case 6 Passed: nested savepoint with async inner callback (isolated rollback)');

  // Case 7: fn throws synchronous Error
  let caught7 = false;
  try {
    dm.transaction((db) => {
      db.run('INSERT INTO items (name) VALUES (?)', ['sync_err_item']);
      throw new Error('sync explode');
    });
  } catch (err) {
    caught7 = true;
    assert.strictEqual(err.message, 'sync explode');
  }
  assert.strictEqual(caught7, true);
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['sync_err_item']), undefined);
  console.log('Case 7 Passed: synchronous error (clean rollback, txDepth restored)');

  // Case 8: Synchronous success returning value
  const r8 = dm.transaction((db) => {
    db.run('INSERT INTO items (name) VALUES (?)', ['success_item']);
    return { status: 'committed' };
  });
  assert.deepStrictEqual(r8, { status: 'committed' });
  assert.strictEqual(dm._txDepth, 0);
  assert.strictEqual(dm.get('SELECT name FROM items WHERE name = ?', ['success_item']).name, 'success_item');
  console.log('Case 8 Passed: synchronous success committed');

  console.log('\nAll 8 corner cases verified and passing!');
}

testAllCornerCases().catch(console.error);
