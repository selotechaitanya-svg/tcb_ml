'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const originalFilePath = 'C:\\Users\\CHAITANYA SELOTE\\OneDrive\\Desktop\\tcb_back\\src\\db\\database.js';
const originalContent = fs.readFileSync(originalFilePath, 'utf8');

// Target snippet in originalContent
const targetSnippet = `  transaction(fn) {
    const isTopLevel = this._txDepth === 0;
    const savepointName = \`sp_\${this._txDepth}\`;
    this._txDepth++;

    if (isTopLevel) {
      this.db.exec('BEGIN IMMEDIATE;');
    } else {
      this.db.exec(\`SAVEPOINT \${savepointName};\`);
    }

    try {
      const result = fn(this);

      // Handle async callbacks within transaction
      if (result && typeof result.then === 'function') {
        return Promise.resolve(result)
          .then((val) => {
            if (isTopLevel) {
              this.db.exec('COMMIT;');
            } else {
              this.db.exec(\`RELEASE SAVEPOINT \${savepointName};\`);
            }
            this._txDepth--;
            return val;
          })
          .catch((err) => {
            if (isTopLevel) {
              this.db.exec('ROLLBACK;');
            } else {
              this.db.exec(\`ROLLBACK TO SAVEPOINT \${savepointName};\`);
            }
            this._txDepth--;
            throw err;
          });
      }

      if (isTopLevel) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(\`RELEASE SAVEPOINT \${savepointName};\`);
      }
      this._txDepth--;
      return result;
    } catch (err) {
      if (isTopLevel) {
        this.db.exec('ROLLBACK;');
      } else {
        this.db.exec(\`ROLLBACK TO SAVEPOINT \${savepointName};\`);
      }
      this._txDepth--;
      throw err;
    }
  }`;

const replacementSnippet = `  transaction(fn) {
    const isTopLevel = this._txDepth === 0;
    const savepointName = \`sp_\${this._txDepth}\`;
    this._txDepth++;
    let rolledBack = false;

    if (isTopLevel) {
      this.db.exec('BEGIN IMMEDIATE;');
    } else {
      this.db.exec(\`SAVEPOINT \${savepointName};\`);
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
          this.db.exec(\`ROLLBACK TO SAVEPOINT \${savepointName};\`);
        }
        rolledBack = true;
        throw new Error(
          'DatabaseSync transaction() callback must be synchronous; async callbacks are not supported because node:sqlite is synchronous. Perform async operations outside the transaction.'
        );
      }

      if (isTopLevel) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(\`RELEASE SAVEPOINT \${savepointName};\`);
      }
      return result;
    } catch (err) {
      if (!rolledBack) {
        if (isTopLevel) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(\`ROLLBACK TO SAVEPOINT \${savepointName};\`);
        }
      }
      throw err;
    } finally {
      this._txDepth--;
    }
  }`;

assert(originalContent.includes(targetSnippet), 'Target snippet must exactly match database.js content');

const patchedContent = originalContent.replace(targetSnippet, replacementSnippet);
assert(patchedContent.includes('let rolledBack = false;'), 'Patched content must include replacement');

// Dynamically load the patched class using module._compile
const m = new module.constructor();
m.paths = module.paths;
m._compile(patchedContent, originalFilePath);

const { DatabaseManager } = m.exports;
assert(DatabaseManager, 'Export DatabaseManager must exist');

console.log('Testing patched DatabaseManager in memory...');
const dbManager = new DatabaseManager(':memory:');

// Test synchronous insert
dbManager.run('CREATE TABLE test (id INTEGER PRIMARY KEY, v TEXT);');
dbManager.transaction((tx) => {
  tx.run('INSERT INTO test (v) VALUES (?)', ['hello']);
});
assert.strictEqual(dbManager.get('SELECT v FROM test WHERE v = ?', ['hello']).v, 'hello');
assert.strictEqual(dbManager._txDepth, 0);

// Test async rejection
let caught = false;
try {
  dbManager.transaction(async (tx) => {
    tx.run('INSERT INTO test (v) VALUES (?)', ['async_val']);
    await new Promise((r) => setTimeout(r, 10));
    throw new Error('should have been rejected already');
  });
} catch (err) {
  caught = true;
  assert.match(err.message, /DatabaseSync transaction\(\) callback must be synchronous/);
}
assert.strictEqual(caught, true);
assert.strictEqual(dbManager.get('SELECT v FROM test WHERE v = ?', ['async_val']), undefined);
assert.strictEqual(dbManager._txDepth, 0);

console.log('In-memory test of patched database.js PASSED perfectly!');
