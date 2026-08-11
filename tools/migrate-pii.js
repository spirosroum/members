// =====================================================================
// migrate-pii.js — FIX-PLAN Step 2.1 (CRITICAL)
// Moves sensitive PII (phone, dob, notes) off the top-level /members docs
// into the admin-only /members/{id}/private/info subcollection, then
// removes those fields from the top-level doc so anonymous clients can no
// longer read them (pentest F1).
//
// Prereqs: npm install (in this tools/ dir) + a Firebase service-account
// key with Firestore edit + Auth access. NEVER commit the key.
//
// Usage:
//   SERVICE_ACCOUNT=/abs/path/to/serviceAccountKey.json node migrate-pii.js
// =====================================================================
const admin = require('firebase-admin');

const serviceAccount = process.env.SERVICE_ACCOUNT;
if (!serviceAccount) {
  console.error('Missing SERVICE_ACCOUNT env var (path to serviceAccountKey.json).');
  process.exit(1);
}

// Mirrors MEMBER_PRIVATE_FIELDS in js/app-core.js. Email is intentionally
// kept public for member Google sign-in resolution.
const PRIVATE_FIELDS = ['phone', 'dob', 'notes'];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'ssg-desk'
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('members').get();
  let moved = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const privateData = {};
    PRIVATE_FIELDS.forEach(f => { if (data[f] !== undefined) privateData[f] = data[f]; });
    if (Object.keys(privateData).length === 0) continue;

    await doc.ref.collection('private').doc('info').set(privateData, { merge: true });

    const update = {};
    PRIVATE_FIELDS.forEach(f => { if (data[f] !== undefined) update[f] = admin.firestore.FieldValue.delete(); });
    await doc.ref.update(update);

    moved++;
    console.log(`Moved PII for member ${doc.id} -> private/info`);
  }

  await db.collection('meta').doc('migration').set(
    { piiMovedAt: new Date().toISOString(), movedMembers: moved },
    { merge: true }
  );
  console.log(`Done. Migrated PII for ${moved} member(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
