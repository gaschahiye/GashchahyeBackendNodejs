const { bucket } = require('../config/firebase');
const stream = require('stream');

class UploadService {
  async uploadFile(buffer, filename, mimetype) {
    return new Promise((resolve, reject) => {
      const blob = bucket.file(`lpg-app/${Date.now()}_${filename}`);
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: mimetype,
        },
        resumable: false
      });

      blobStream.on('error', (error) => {
        reject(new Error(`Upload failed: ${error.message}`));
      });

      blobStream.on('finish', async () => {
        // Make the file public
        await blob.makePublic();
        
        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        resolve(publicUrl);
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

  async uploadQRCode(buffer, orderId) {
    const filename = `qr-codes/${orderId}_${Date.now()}.png`;
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