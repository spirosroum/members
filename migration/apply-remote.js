// =====================================================================
// apply-remote.js — Applies the Supabase migration SQL to a live project
// via the Management API (requires a Personal Access Token, no DB password).
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node apply-remote.js
// =====================================================================
const fs = require('fs');
const path = require('path');

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || 'lwmwihdfwafnhtykslbz';
if (!PAT) { console.error('Set SUPABASE_ACCESS_TOKEN.'); process.exit(1); }

const API = `https://api.supabase.com/v1/projects/${REF}/database`;

async function query(sql) {
  const res = await fetch(`${API}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  return text;
}

async function enableExtension(name, schema) {
  const res = await fetch(`${API}/extensions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, schema })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Enable extension ${name} failed (${res.status}): ${text}`);
  return text;
}

async function main() {
  const init = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260813000001_init.sql'), 'utf8');
  console.log('Applying 20260813000001_init.sql …');
  await query(init);
  console.log('OK: init.sql applied');

  // pg_cron is required by the cron jobs migration.
  const ext = await query("select extname from pg_extension where extname = 'pg_cron'");
  if (ext.indexOf('pg_cron') === -1) {
    console.log('pg_cron not enabled — enabling via Management API…');
    try {
      await enableExtension('pg_cron', 'pg_cron');
      console.log('OK: pg_cron enabled');
    } catch (e) {
      console.warn('Could not auto-enable pg_cron:', e.message);
      console.warn('Enable it manually: Dashboard → Database → Extensions → pg_cron, then re-run.');
    }
  } else {
    console.log('pg_cron already enabled.');
  }

  const cron = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260813000002_cron_jobs.sql'), 'utf8');
  console.log('Applying 20260813000002_cron_jobs.sql …');
  await query(cron);
  console.log('OK: cron_jobs.sql applied');

  console.log('Migration complete.');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
