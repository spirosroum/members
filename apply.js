// =====================================================================
// apply.js — Applies the Supabase migration SQL files to a live project
// over a direct Postgres connection. Use this instead of the SQL editor
// when you want the migration run programmatically.
//
// Usage:
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
//   node apply.js
//
// The session-mode pooler (port 5432) or the direct connection
// (db.<ref>.supabase.co:5432) both work; the transaction pooler (6543)
// is NOT supported for multi-statement scripts.
// =====================================================================
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Set DATABASE_URL (see header).');
  process.exit(1);
}

const MIGRATIONS = [
  path.join(__dirname, '..', 'supabase', 'migrations', '20260813000001_init.sql'),
  path.join(__dirname, '..', 'supabase', 'migrations', '20260813000002_cron_jobs.sql')
];

const only = process.argv[2]; // optional: pass a filename to apply just that file

async function applyFile(client, file) {
  const sql = fs.readFileSync(file, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log('OK  ' + path.basename(file));
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(path.basename(file) + ' failed: ' + err.message);
  }
}

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected. Applying migrations…');

  const files = only ? MIGRATIONS.filter(f => path.basename(f) === only) : MIGRATIONS;
  if (files.length === 0) {
    console.error('No migration matches "' + only + '". Available: ' + MIGRATIONS.map(f => path.basename(f)).join(', '));
    process.exit(1);
  }

  for (const f of files) {
    try {
      await applyFile(client, f);
    } catch (err) {
      console.error(err.message);
      console.error('Note: 000002 requires pg_cron enabled (Database → Extensions).');
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('Migration complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
