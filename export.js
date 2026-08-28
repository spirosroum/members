// =====================================================================
// export.js — GymDesk Firestore → Supabase migration, Step 1 of 3.
// Dumps every Firestore collection + array doc + the member PII
// subcollection into migration/export/firestore-export.json.
//
// Prereqs:
//   npm install                        (in this migration/ dir)
//   a Firebase service-account key with Firestore read access
//
// Usage:
//   SERVICE_ACCOUNT=/abs/path/serviceAccountKey.json node export.js
// =====================================================================
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = process.env.SERVICE_ACCOUNT;
if (!serviceAccount) {
  console.error('Missing SERVICE_ACCOUNT env var (path to serviceAccountKey.json).');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'ssg-desk'
});

const db = admin.firestore();

// Per-record collections (docId == record.id).
const COLLECTIONS = [
  'members',
  'visits',
  'payments',
  'plans',
  'planBin',
  'scheduleBin',
  'notificationBin',
  'classCheckins',
  'notifications',
  'bin'
];

// Array-docs (single 'global' doc holding { items: [...] }).
const ARRAY_DOCS = ['schedules', 'closedDates'];

async function exportCollection(name) {
  const snap = await db.collection(name).get();
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, data: d.data() }));
  return docs;
}

async function exportArrayDoc(name) {
  const snap = await db.collection(name).doc('global').get();
  return snap.exists ? (snap.data() || {}) : {};
}

// PII subcollection: /members/{id}/private/info
async function exportMemberPrivate() {
  const members = await db.collection('members').get();
  const priv = [];
  for (const m of members.docs) {
    const info = await m.ref.collection('private').doc('info').get();
    if (info.exists) priv.push({ memberId: m.id, data: info.data() });
  }
  return priv;
}

async function main() {
  const outDir = path.join(__dirname, 'export');
  fs.mkdirSync(outDir, { recursive: true });

  const out = {};
  for (const c of COLLECTIONS) out[c] = await exportCollection(c);
  for (const c of ARRAY_DOCS) out[c] = await exportArrayDoc(c);
  out.settings = await exportArrayDoc('settings');
  out.memberPrivate = await exportMemberPrivate();

  const dest = path.join(outDir, 'firestore-export.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));

  const summary = Object.keys(out)
    .map(k => `${k}=${Array.isArray(out[k]) ? out[k].length : 1}`)
    .join(', ');
  console.log(`Exported → ${dest}`);
  console.log(`Summary: ${summary}`);
}

main().catch(err => { console.error(err); process.exit(1); });
