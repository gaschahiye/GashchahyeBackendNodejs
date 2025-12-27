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

  async generateAndUploadQRCode(orderId, additionalData = {}) {
    try {
      const qrData = {
        orderId,
        type: 'lpg_delivery',
        timestamp: new Date().toISOString(),
        ...additionalData
      };

      const qrString = JSON.stringify(qrData);
      const qrCode = await this.generateQRCode(qrString);
      
      // Upload to Firebase Storage
      const qrCodeUrl = await uploadService.uploadQRCode(
        qrCode.buffer, 
        orderId
      );

      return {
        qrCode: qrString, // Store this in database for verification
        qrCodeUrl: qrCodeUrl,
        qrCodeDataURL: qrCode.dataURL
      };
    } catch (error) {
      throw new Error(`QR code upload failed: ${error.message}`);
    }
  }

  async verifyQRCode(scannedData, expectedData) {
    try {
      const parsedData = JSON.parse(scannedData);
      
      // Basic validation
      if (!parsedData.orderId || !parsedData.timestamp) {
        return { isValid: false, reason: 'Invalid QR code format' };
      }

      // Check if QR code is expired (optional - for time-sensitive operations)
      const qrTimestamp = new Date(parsedData.timestamp);
      const now = new Date();
      const diffHours = (now - qrTimestamp) / (1000 * 60 * 60);
      
      if (diffHours > 24) { // QR code valid for 24 hours
        return { isValid: false, reason: 'QR code expired' };
      }

      // Compare with expected data
      if (expectedData.orderId && parsedData.orderId !== expectedData.orderId) {
        return { isValid: false, reason: 'Order ID mismatch' };
      }

      return {
        isValid: true,
        data: parsedData
      };
    } catch (error) {
      return { isValid: false, reason: 'Invalid QR code data' };
    }
  }
}

module.exports = new QRCodeService();