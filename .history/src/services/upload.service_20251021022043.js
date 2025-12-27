const { bucket } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('../utils/logger');

exports.uploadToFirebase = async (file, folder = 'uploads') => {
  try {
    const fileName = `${folder}/${uuidv4()}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });
    
    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        logger.error('Firebase upload error:', error);
        reject(error);
      });
      
      stream.on('finish', async () => {
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('Upload service error:', error);
    throw error;
  }
};

exports.uploadBase64ToFirebase = async (base64Data, folder = 'uploads', extension = 'jpg') => {
  try {
    const fileName = `${folder}/${uuidv4()}.${extension}`;
    const fileUpload = bucket.file(fileName);
    
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    
    await fileUpload.save(buffer, {
      metadata: {
        contentType: `image/${extension}`
      }
    });
    
    await fileUpload.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  } catch (error) {
    logger.error('Base64 upload error:', error);
    throw error;
  }
};

exports.deleteFromFirebase = async (fileUrl) => {
  try {
    const fileName = fileUrl.split(`${bucket.name}/`)[1];
    if (fileName) {
      await bucket.file(fileName).delete();
      logger.info(`File deleted: ${fileName}`);
    }
  } catch (error) {
    logger.error('Delete file error:', error);
  }
};
