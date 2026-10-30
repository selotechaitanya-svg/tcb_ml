'use strict';

const { DatabaseSync } = require('node:sqlite');

function testIndexSql(indexCollation) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX idx_users_username ON users(username ${indexCollation});
  `);

  const master = db.prepare("SELECT name, sql FROM sqlite_master WHERE name = 'idx_users_username'").get();
  const info = db.prepare("PRAGMA index_xinfo('idx_users_username')").all();
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM users WHERE username = ? COLLATE NOCASE").all('test');
  
  return { sql: master.sql, info, plan };
}

console.log('Without explicit NOCASE in CREATE INDEX:');
console.log(JSON.stringify(testIndexSql(''), null, 2));

console.log('With explicit NOCASE in CREATE INDEX:');
console.log(JSON.stringify(testIndexSql('COLLATE NOCASE'), null, 2));
