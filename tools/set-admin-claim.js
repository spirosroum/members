// =====================================================================
// set-admin-claim.js — FIX-PLAN Step 8.3
// Sets the `admin: true` custom claim on a user UID. This MUST be done
// before deploying the rules/client changes that gate admin on the claim
// (the email fallback is removed), or the admin will be locked out.
//
// Prereqs: npm install (in this tools/ dir) + a Firebase service-account
// key with Auth admin access. NEVER commit the key.
//
// Usage:
//   SERVICE_ACCOUNT=/abs/path/to/serviceAccountKey.json node set-admin-claim.js <uid>
// =====================================================================
const admin = require('firebase-admin');

const serviceAccount = process.env.SERVICE_ACCOUNT;
const uid = process.argv[2];
if (!serviceAccount || !uid) {
  console.error('Missing args. Usage: SERVICE_ACCOUNT=/path/serviceAccountKey.json node set-admin-claim.js <uid>');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => console.log(`Set admin:true on ${uid}. Existing tokens are invalidated on next refresh.`))
  .catch(err => { console.error(err); process.exit(1); });
