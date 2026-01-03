const admin = require('firebase-admin');

let serviceAccount;

// ✅ 1. Railway / Production (ENV)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n/g, '\n')
  );
  console.log('Using Firebase credentials from ENV');
}

// ✅ 2. Local development (JSON file)
else {
  serviceAccount = require('../../gaschahiye-c6f00-firebase-adminsdk-fbsvc-e8bd2ae386.json');
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
