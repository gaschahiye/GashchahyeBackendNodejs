const { bucket } = require('../config/firebase');
const stream = require('stream');

class UploadService {
  // Function requires: const bucket = admin.storage().bucket();
  async  uploadFile(buffer, filename, mimetype) {
    return new Promise((resolve, reject) => {
      // blob is the File object from the GCS SDK
      const blob = bucket.file(`lpg-app/${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: mimetype,
        },
        resumable: false
      });

      blobStream.on('error', (error) => {
        console.error(`GCS Upload Stream Error: ${error.message}`);
        reject(new Error(`Upload failed: ${error.message}`));
      });

      blobStream.on('finish', async () => {
        try {
          // ⭐️ FIX: Use getSignedUrl() instead of getDownloadURL() ⭐️
          // Generate a signed URL with a very long expiry (e.g., 100 years from now).
          // This acts as a robust, public, tokenized link for clients like Flutter.
          const [publicUrl] = await blob.getSignedUrl({
            action: 'read',
            expires: '01-01-2125', // Expires in year 2125 (effectively permanent)
          });

          resolve(publicUrl);

        } catch (error) {
          console.error(`Failed to get signed URL for ${filename}:`, error.message);
          reject(new Error(`Failed to get download URL: ${error.message}`));
        }
      });

      // Create a readable stream from buffer and pipe to blobStream
      const bufferStream = new stream.PassThrough();
      bufferStream.end(buffer);
      bufferStream.pipe(blobStream);
    });
  }

  async uploadImage(buffer, originalname, mimetype) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    
    if (!allowedTypes.includes(mimetype)) {
      throw new Error('Invalid image type. Only JPEG, PNG, JPG, and WebP are allowed.');
    }

    const filename = `images/${Date.now()}_${originalname}`;
    return this.uploadFile(buffer, filename, mimetype);
  }

  async uploadPDF(buffer, originalname, mimetype) {
    if (mimetype !== 'application/pdf') {
      throw new Error('Invalid file type. Only PDF is allowed.');
    }

    const filename = `documents/${Date.now()}_${originalname}`;
    return this.uploadFile(buffer, filename, mimetype);
  }

  async uploadQRCode(buffer,orderId) {

    const filename = `qr-codes/${orderId}.png`;
    return this.uploadFile(buffer, filename, 'image/png');
  }

  async deleteFile(fileUrl) {
    try {
      // Extract file path from URL
      const filePath = fileUrl.split(`${bucket.name}/`)[1];
      if (!filePath) {
        throw new Error('Invalid file URL');
      }

      const file = bucket.file(filePath);
      await file.delete();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
}

module.exports = new UploadService();