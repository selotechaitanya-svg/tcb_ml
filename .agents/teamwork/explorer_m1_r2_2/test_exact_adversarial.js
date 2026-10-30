'use strict';

// Test that our proposed DatabaseManager replacement passes the exact adversarial test from adversarial_m1_2.test.js
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');

class DatabaseManager {
  constructor(dbPath = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this._txDepth = 0;
    this.init();
  }

  init() {
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
        created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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

async function testAdversarialCase() {
  const dbManager = new DatabaseManager(':memory:');
  const transaction = (fn) => dbManager.transaction(fn);
  const get = (sql, params) => dbManager.get(sql, params);

  // Replicate exact test from tests/adversarial_m1_2.test.js:482
  let committedPrematurely = false;
  try {
    await transaction(async (db) => {
      db.run(
        'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['async_tx_user', 'async_tx@test.com', 'hash', 'Citizen']
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('Simulated async failure after insert');
    });
  } catch (err) {
    const u = get('SELECT id FROM users WHERE username = ?', ['async_tx_user']);
    if (u) {
      committedPrematurely = true;
    }
  }

  assert.strictEqual(
    committedPrematurely,
    false,
    'Async callback inside transaction committed prematurely before error occurred! Database consistency compromised.'
  );

  console.log('Adversarial test case passed 100% with the proposed transaction guard!');
}

testAdversarialCase().catch(console.error);
