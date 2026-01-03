const admin = require('firebase-admin');
const serviceAccount = require('../../gas.json');
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'gaschahiye-c6f00.firebasestorage.app'
  });
  
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };