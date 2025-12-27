const axios = require('axios');
const logger = require('../utils/logger');

exports.processJazzCashPayment = async (order) => {
  try {
    const response = await axios.post(
      process.env.JAZZCASH_API_URL,
      {
        amount: order.pricing.grandTotal,
        orderId: order.orderId,
        merchantId: process.env.JAZZCASH_MERCHANT_ID,
        callbackUrl: `${process.env.API_URL}/api/payments/jazzcash/callback`
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.JAZZCASH_API_KEY}`
        }
      }
    );
    
    return {
      success: true,
      transactionId: response.data.transactionId,
      paymentUrl: response.data.paymentUrl
    };
  } catch (error) {
    logger.error('JazzCash payment error:', error);
    return { success: false, error: error.message };
  }
};

exports.processEasyPaisaPayment = async (order) => {
  try {
    const response = await axios.post(
      process.env.EASYPAISA_API_URL,
      {
        amount: order.pricing.grandTotal,
        orderId: order.orderId,
        storeId: process.env.EASYPAISA_STORE_ID
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.EASYPAISA_API_KEY}`
        }
      }
    );
    
    return {
      success: true,
      transactionId: response.data.transactionId,
      paymentUrl: response.data.paymentUrl
    };
  } catch (error) {
    logger.error('EasyPaisa payment error:', error);
    return { success: false, error: error.message };
  }
};