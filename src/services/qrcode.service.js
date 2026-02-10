const QRCode = require('qrcode');
const uploadService = require('./upload.service');

class QRCodeService {
  async generateQRCode(data, options = {}) {
    try {
      const defaultOptions = {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 300,
        ...options
      };

      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(data, defaultOptions);

      // Convert data URL to buffer
      const buffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

      return {
        data: data,
        dataURL: qrCodeDataURL,
        buffer: buffer
      };
    } catch (error) {
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }

  async generateAndUploadQRCode(orderId) {
    try {
      const buffer = await QRCode.toBuffer(orderId, {
        type: 'png',
        width: 300,
        errorCorrectionLevel: 'H',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // TODO: Uncomment when Firebase billing is updated
      // Upload to Firebase Storage
      // const qrCodeUrl = await uploadService.uploadQRCode(buffer, orderId);

      return {
        qrCode: orderId,
        qrCodeUrl: null, // Returning null for now as upload is disabled
      };
    } catch (error) {
      throw new Error(`QR code generation failed (upload disabled): ${error.message}`);
    }
  }


  async verifyQRCode(scannedData, expectedData) {
    // scannedData = string from QR scan
    if (!scannedData) {
      return { isValid: false, reason: 'Empty QR code' };
    }

    if (expectedData.orderId && scannedData !== expectedData.qrCode) {
      return { isValid: false, reason: 'QR code does not match this order' };
    }

    return { isValid: true, data: scannedData };
  }

}

module.exports = new QRCodeService();