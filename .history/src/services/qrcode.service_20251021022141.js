const QRCode = require('qrcode');
const { uploadBase64ToFirebase } = require('./upload.service');
const logger = require('../utils/logger');

exports.generateQRCode = async (data) => {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: 300
    });
    
    const qrCodeUrl = await uploadBase64ToFirebase(qrCodeDataURL, 'qrcodes', 'png');
    
    return {
      qrCode: data,
      qrCodeUrl
    };
  } catch (error) {
    logger.error('QR code generation error:', error);
    throw error;
  }
};