const User = require('../models/User');
const OTPService = require('../services/otp.service');
const NotificationService = require('../services/notification.service');
const UploadService = require('../services/upload.service');
const jwt = require('jsonwebtoken');
const Inventory = require('../models/Inventory');
const location = require('../models/Location');
const { notifyAdminNewSeller } = require('../config/socket');
// ---------------------------
// Register Buyer
// ---------------------------
const registerBuyer = async (req, res, next) => {
  try {
    let {
      phoneNumber,
      email,
      password,
      fullName,
      cnic,
      userType,
      language
    } = req.body;
    if (phoneNumber && phoneNumber.startsWith('0')) {
      phoneNumber = '+92' + phoneNumber.slice(1);
    }
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
      ...(process.env.NODE_ENV === 'development' && { otp: otpResult.otp }),
      otp:otpResult.otp
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------
// Register Seller
// ---------------------------
const registerSeller = async (req, res, next) => {
  console.log(req.body);
  try {
    let {
      businessName,
      phoneNumber,
      orgaLicenseNumber,
      orgaExpDate,
      ntnNumber,
      password,
      currentLocation
    } = req.body;

    // ✅ Convert starting '0' to '+92'
    if (phoneNumber && phoneNumber.startsWith('0')) {
      phoneNumber = '+92' + phoneNumber.slice(1);
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [{ phoneNumber }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this phone number or email'
      });
    }

    // ---- 🔹 Upload License Image if provided ----
    let orgaLicenseFileUrl = null;
    if (req.file) {
      const buffer = req.file.buffer;
      const mimetype = req.file.mimetype;
      const originalname = req.file.originalname;

      orgaLicenseFileUrl = await UploadService.uploadImage(
          buffer,
          originalname,
          mimetype
      );
    }

    // ---- 🔹 Create Seller ----
    const user = await User.create({
      role: 'seller',
      phoneNumber,
      password,
      businessName,
      orgaLicenseNumber,
      orgaExpDate: new Date(orgaExpDate),
      ntnNumber,
      sellerStatus: 'pending',
      orgaLicenseFile: orgaLicenseFileUrl, // ✅ store uploaded image link here
      currentLocation: currentLocation || {
        type: 'Point',
        coordinates: [0, 0],
      },
    });

    // ---- 🔹 Send OTP ----
    const otpResult = await OTPService.generateOTP(phoneNumber);

    // ---- 🔹 Notify Admin via Database Notification ----
    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      await NotificationService.createNotification(admin._id, {
        title: 'New Seller Registration',
        message: `${businessName} has registered as a seller and is awaiting approval.`,
        type: 'system',
      });
    }

    // 🆕 NEW: NOTIFY ADMIN VIA SOCKET (REAL-TIME)
    notifyAdminNewSeller({
      _id: user._id,
      businessName: user.businessName,
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      createdAt: user.createdAt,
      sellerStatus: user.sellerStatus,
      // Add any other relevant fields
    });

    // ---- 🔹 Response ----
    res.status(201).json({
      success: true,
      message: 'Registration successful. Awaiting admin approval.',
      userId: user._id,
      licenseFile: orgaLicenseFileUrl,
      ...(process.env.NODE_ENV === 'development' && { otp: otpResult.otp }),
    });

  } catch (error) {
    next(error);
  }
};
// me funciton to see if the auth is expired or not thank you

const me = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing or malformed',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId)
        .select('-password -refreshToken');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Initialize
    let hasInventory = false;
    let locationsWithInventory = [];

    if (user.role === 'seller') {
      // Get all seller locations
      const locations = await location.find({ seller: user._id });

      // For each location, check if inventory exists
      const inventoryData = await Inventory.find({ seller: user._id });

      locationsWithInventory = locations
          .filter((loc) =>
              inventoryData.some(
                  (inv) => inv.locationid?.toString() === loc._id.toString()
              )
          )
          .map((loc) => {
            hasInventory = true; // set top-level inventory flag
            return {
              ...loc.toObject(),
              isinventory: true, // only locations that have inventory
            };
          });
    }

      res.json({
        success: true,
        message: 'User profile fetched successfully',
        user,
        inventory: hasInventory,
        locations: locationsWithInventory,
      });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
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
    await user.save(); // ✅ Now won't throw

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
        sellerStatus: user.sellerStatus,
      },
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
    // if (!user.currentLocation || !Array.isArray(user.currentLocation.coordinates)) {
    //   user.currentLocation = {
    //     type: 'Point',
    //     coordinates: [0, 0]
    //   };
    //   await user.save();
    // }
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password',
    
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
      otp:result.otp,
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
  resendOTP,
  me
};
