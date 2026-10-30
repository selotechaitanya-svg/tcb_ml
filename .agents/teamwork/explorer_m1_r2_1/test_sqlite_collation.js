'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync(':memory:');
const ddl = fs.readFileSync('C:/Users/CHAITANYA SELOTE/OneDrive/Desktop/tcb_back/src/db/schema.sql', 'utf8');
db.exec(ddl);

console.log('=== sqlite_master index entries ===');
const masterIndexes = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'").all();
console.log(JSON.stringify(masterIndexes, null, 2));

console.log('\n=== PRAGMA index_list(users) ===');
const indexList = db.prepare("PRAGMA index_list('users')").all();
console.log(JSON.stringify(indexList, null, 2));

for (const idx of indexList) {
  console.log(`\n=== PRAGMA index_xinfo('${idx.name}') ===`);
  const indexXInfo = db.prepare(`PRAGMA index_xinfo('${idx.name}')`).all();
  console.log(JSON.stringify(indexXInfo, null, 2));
}

console.log('\n=== Testing UNIQUE insertion under COLLATE NOCASE ===');
db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES ('SpiderMan', 'spidey@nyc.gov', 'hash1', 'Hero')").run();

try {
  db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES ('spiderman', 'spidey2@nyc.gov', 'hash2', 'Hero')").run();
  console.log('UNEXPECTED: spiderman succeeded!');
} catch (err) {
  console.log('EXPECTED ERROR:', err.code, err.message);
}

try {
  db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES ('peter', 'SPIDEY@NYC.GOV', 'hash3', 'Citizen')").run();
  console.log('UNEXPECTED: SPIDEY@NYC.GOV succeeded!');
} catch (err) {
  console.log('EXPECTED ERROR on email:', err.code, err.message);
}

console.log('\n=== Testing Query Plan for WHERE username = ? COLLATE NOCASE ===');
const plan1 = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM users WHERE username = ? COLLATE NOCASE").all('spiderman');
console.log('Plan 1 (with explicit COLLATE NOCASE in query):', JSON.stringify(plan1, null, 2));

const plan2 = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM users WHERE username = ?").all('spiderman');
console.log('Plan 2 (without explicit COLLATE NOCASE in query):', JSON.stringify(plan2, null, 2));
