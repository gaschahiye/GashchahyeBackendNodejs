const admin = require('firebase-admin');
const serviceAccount = require('../../gas.json');


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