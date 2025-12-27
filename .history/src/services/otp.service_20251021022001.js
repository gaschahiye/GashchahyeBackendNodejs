const crypto = require('crypto');
const bcrypt = require('bcrypt');
const twilio = require('twilio');
const User = require('../models/User');
const logger = require('../utils/logger');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendOTP = async (phoneNumber) => {
  try {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    await User.findOneAndUpdate(
      { phoneNumber },
      {
        otp: {
          code: await bcrypt.hash(otp, 10),
          expiresAt
        }
      }
    );
    
    await twilioClient.messages.create({
      body: `Your LPG App verification code is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    
    logger.info(`OTP sent to ${phoneNumber}`);
    return { success: true };
  } catch (error) {
    logger.error('OTP sending failed:', error);
    throw error;
  }
};

exports.verifyOTP = async (phoneNumber, otpCode) => {
  const user = await User.findOne({ phoneNumber });
  
  if (!user || !user.otp || !user.otp.code) {
    throw new Error('OTP not found');
  }
  
  if (new Date() > user.otp.expiresAt) {
    throw new Error('OTP expired');
  }
  
  const isValid = await bcrypt.compare(otpCode, user.otp.code);
  
  if (!isValid) {
    throw new Error('Invalid OTP');
  }
  
  user.isVerified = true;
  user.otp = undefined;
  await user.save();
  
  return user;
};