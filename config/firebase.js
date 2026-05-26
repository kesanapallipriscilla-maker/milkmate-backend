const admin = require('firebase-admin');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
  console.log('serviceAccountKey.json loaded — project_id:', serviceAccount.project_id);
} catch (err) {
  console.error('ERROR: Could not load serviceAccountKey.json:', err.message);
  console.error('Make sure the file exists at backend/config/serviceAccountKey.json');
  process.exit(1);
}

try {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase Admin SDK initialized successfully');
} catch (err) {
  console.error('ERROR: Firebase Admin initialization failed:', err.message);
  process.exit(1);
}

module.exports = admin;
