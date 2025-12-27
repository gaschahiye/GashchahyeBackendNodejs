const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');

class OTPService {
  async generateOTP(phoneNumber) {
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Set expiry to 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    // Hash OTP before saving
    const hashedOTP = await bcrypt.hash(otp, 10);
    
    // Save OTP to user
    await User.findOneAndUpdate(
      { phoneNumber },
      {
        otp: {
          code: hashedOTP,
          expiresAt
        }
      }
    );
    
    // In production, this would send an actual SMS
    // For development, we'll log the OTP
    console.log(`📱 OTP for ${phoneNumber}: ${otp} (Expires: ${expiresAt.toLocaleTimeString()})`);
    
    return {
      success: true,
      message: 'OTP sent successfully',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined // Only return OTP in development
    };
  }

  async verifyOTP(phoneNumber, otpCode) {
    const user = await User.findOne({ phoneNumber });
    
    if (!user || !user.otp || !user.otp.code) {
      throw new Error('OTP not found or expired');
    }
    
    if (new Date() > user.otp.expiresAt) {
      // Clear expired OTP
      await User.findByIdAndUpdate(user._id, { $unset: { otp: 1 } });
      throw new Error('OTP expired');
    }
    
    const isValid = await bcrypt.compare(otpCode, user.otp.code);
    
    if (!isValid) {
      throw new Error('Invalid OTP');
    }
    
    // Clear OTP after successful verification
    await User.findByIdAndUpdate(user._id, { 
      $unset: { otp: 1 },
      isVerified: true 
    });
    
    return user;
  }

  async resendOTP(phoneNumber) {
    return this.generateOTP(phoneNumber);
  }
}

module.exports = new OTPService();