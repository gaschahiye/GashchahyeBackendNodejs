const User = require('../models/User');
const OTPService = require('../services/otp.service');
const NotificationService = require('../services/notification.service');
const jwt = require('jsonwebtoken');

// ---------------------------
// Register Buyer
// ---------------------------
const registerBuyer = async (req, res, next) => {
  try {
    const {
      phoneNumber,
      email,
      password,
      fullName,
      cnic,
      userType,
      language
    } = req.body;

    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this phone number or email'
      });
    }

 const user = await User.create({
  role: 'buyer',
  phoneNumber,
  email,
  password,
  fullName,
  cnic,
  userType,
  language,
  currentLocation: {        // <-- add this
    type: 'Point',
    coordinates: [0, 0]    // default lat,lng
  }
});
    const otpResult = await OTPService.generateOTP(phoneNumber);

    res.status(201).json({
      success: true,
      message: 'Registration successful. OTP sent to your phone.',
      userId: user._id,
      ...(process.env.NODE_ENV === 'development' && { otp: otpResult.otp })
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Register Seller
// ---------------------------
const registerSeller = async (req, res, next) => {
  try {
    const {
      businessName,
      phoneNumber,
      email,
      orgaLicenseNumber,
      orgaExpDate,
      ntnNumber,
      password
    } = req.body;

    const existingUser = await User.findOne({
      $or: [{ phoneNumber }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this phone number or email'
      });
    }

    const user = await User.create({
      role: 'seller',
      phoneNumber,
      email,
      password,
      businessName,
      orgaLicenseNumber,
      orgaExpDate: new Date(orgaExpDate),
      ntnNumber,
      sellerStatus: 'pending'
    });

    const otpResult = await OTPService.generateOTP(phoneNumber);

    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      await NotificationService.createNotification(admin._id, {
        title: 'New Seller Registration',
        message: `${businessName} has registered as a seller and is awaiting approval.`,
        type: 'system'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Awaiting admin approval.',
      userId: user._id,
      ...(process.env.NODE_ENV === 'development' && { otp: otpResult.otp })
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Verify OTP
// ---------------------------
const verifyOTP = async (req, res, next) => {
  try {
    const { phoneNumber, otp } = req.body;
    const user = await OTPService.verifyOTP(phoneNumber, otp);

    const accessToken = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      message: 'Account verified successfully',
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        role: user.role,
        phoneNumber: user.phoneNumber,
        email: user.email,
        fullName: user.fullName,
        isVerified: user.isVerified,
        sellerStatus: user.sellerStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Login
// ---------------------------
const login = async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body;

    const user = await User.findOne({ phoneNumber }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    const accessToken = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        role: user.role,
        phoneNumber: user.phoneNumber,
        email: user.email,
        fullName: user.fullName,
        isVerified: user.isVerified,
        sellerStatus: user.sellerStatus,
        businessName: user.businessName
      }
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Refresh Token
// ---------------------------
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    const newAccessToken = user.generateAuthToken();

    res.json({
      success: true,
      accessToken: newAccessToken
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Logout
// ---------------------------
const logout = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(400).json({
        success: false,
        message: 'No user context found'
      });
    }

    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Resend OTP
// ---------------------------
const resendOTP = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    const result = await OTPService.resendOTP(phoneNumber);

    res.json({
      success: true,
      message: 'OTP resent successfully',
      ...(process.env.NODE_ENV === 'development' && { otp: result.otp })
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Export all controllers
// ---------------------------
module.exports = {
  registerBuyer,
  registerSeller,
  verifyOTP,
  login,
  refreshToken,
  logout,
  resendOTP
};
