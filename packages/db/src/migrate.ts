#!/usr/bin/env -S node --enable-source-maps
import { openDb, applyMigrations } from './connection.js';

const db = openDb({ migrate: false });
const ran = applyMigrations(db);
if (ran.length === 0) {
  console.log('[db] no pending migrations');
} else {
  console.log(`[db] applied ${ran.length} migration(s):`);
  ran.forEach((f) => console.log(`     ${f}`));
}
db.close();
