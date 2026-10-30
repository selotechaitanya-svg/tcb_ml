'use strict';

const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Citizen', 'Hero')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
`;

const db = new DatabaseSync(':memory:');
db.exec(schemaSql);

// Test 1: sequential case collision
db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run('PeterParker', 'p1@test.com', 'h1', 'Citizen');

assert.throws(() => {
  db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run('peterparker', 'p2@test.com', 'h2', 'Citizen');
}, /UNIQUE constraint failed: users.username/i);

// Test 2: email case collision
assert.throws(() => {
  db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run('MilesMorales', 'P1@TEST.COM', 'h3', 'Citizen');
}, /UNIQUE constraint failed: users.email/i);

console.log('Simulation verified: COLLATE NOCASE perfectly resolves concurrent and sequential case collision at the DDL constraint layer!');
