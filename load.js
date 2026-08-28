// =====================================================================
// load.js — GymDesk Firestore → Supabase migration, Step 3 of 3.
// Loads the transformed JSON (migration/transformed/*.json) into
// Supabase using the service-role key (bypasses RLS, as a trusted
// server-side import should).
//
// Insert order respects foreign keys: members → member_private → visits
// → class_checkins → schedules → schedule_slots → plans → payments …
//
// Prereqs:
//   npm install                        (in this migration/ dir)
//   a Supabase project with the Phase-1 migration already applied
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
//   node load.js
// =====================================================================
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const T = path.join(__dirname, 'transformed');

// name -> conflict column (or null for plain insert, e.g. bins with a
// server-generated uuid).
const TABLES = [
  ['members', 'id'],
  ['member_private', 'member_id'],
  ['visits', 'id'],
  ['class_checkins', 'id'],
  ['schedules', 'id'],
  ['schedule_slots', 'id'],
  ['closed_dates', 'id'],
  ['plans', 'id'],
  ['payments', 'id'],
  ['notifications', 'id'],
  ['bins', null],
  ['settings', 'key']
];

async function loadTable(name, conflictCol) {
  const file = path.join(T, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`Skip ${name}: ${file} not found. Run transform.js first.`);
    return;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) { console.log(`${name}: 0 rows`); return; }

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    let res;
    if (conflictCol) {
      res = await sb.from(name).upsert(chunk, { onConflict: conflictCol });
    } else {
      res = await sb.from(name).insert(chunk);
    }
    if (res.error) throw new Error(`${name} failed: ${res.error.message}`);
  }
  console.log(`${name}: ${rows.length} rows`);
}

async function main() {
  for (const [name, conflict] of TABLES) {
    await loadTable(name, conflict);
  }
  console.log('Load complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
