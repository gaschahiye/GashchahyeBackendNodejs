const admin = require('firebase-admin');

let serviceAccount;

// ✅ 1. Railway / Production (ENV)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount =


      JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64')
          .toString('utf8'));
  console.log('Using Firebase credentials from ENV');
}

// ✅ 2. Local development (JSON file)
else {
  serviceAccount = require('../../gas.json');
  console.log('Using Firebase credentials from gas.json');
}

// ✅ Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),

    // ⚠️ CORRECT BUCKET NAME
    storageBucket: 'gaschahiye-c6f00.firebasestorage.app',
  });

  console.log('Firebase Admin initialized successfully');
}

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };
