const admin = require('firebase-admin');
const serviceAccount = require('../../gas.json');


try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
  
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };