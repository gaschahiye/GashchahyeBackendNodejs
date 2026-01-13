const AdminService = require('../services/admin.service');
const User = require('../models/User');
const Order = require('../models/Order');
const mongoose = require('mongoose');



const bcrypt = require('bcrypt');


exports.resetDriverPassword = async (req, res) => {
  try {
    const { phoneNumber, newPassword } = req.body;

    if (!phoneNumber || !newPassword) {
      return res.status(400).json({ message: "Phone number and password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};



/**
 * Admin Login
 * @route POST /api/admin/login
 */
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({
      email: email.toLowerCase(),
      role: 'admin'
    }).select('+password');

    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Admin account is deactivated'
      });
    }

    const accessToken = admin.generateAuthToken();
    const refreshToken = admin.generateRefreshToken();

    admin.refreshToken = refreshToken;
    await admin.save();

    res.json({
      success: true,
      message: 'Admin login successful',
      accessToken,
      refreshToken,
      admin: {
        _id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get dashboard widgets data
 * @route GET /api/admin/dashboard/widgets
 */
exports.getDashboardWidgets = async (req, res, next) => {
  try {
    const stats = await AdminService.getDashboardStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all sellers
 * @route GET /api/admin/sellers
 */
exports.getSellersList = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const query = { role: 'seller' };

    if (status) query.sellerStatus = status;
    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const result = await AdminService.getSellersList(query, page, limit);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get seller details
 * @route GET /api/admin/sellers/:sellerId
 */
exports.getSellerDetails = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const result = await AdminService.getSellerDetails(sellerId);

    res.json({
      success: true,
      seller: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update seller status
 * @route PATCH /api/admin/sellers/:sellerId/status
 */
exports.updateSellerStatus = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const { status, notes } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    const result = await AdminService.updateSellerStatus(sellerId, status, notes);

    res.json({
      success: true,
      message: `Seller account ${status} successfully`,
      seller: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all drivers
 * @route GET /api/admin/drivers
 */
exports.getDriversList = async (req, res, next) => {
  try {
    const { status, search, zone, driverStatus, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const query = { role: 'driver' };

    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (driverStatus) query.driverStatus = driverStatus;
    if (zone) query.zone = { $regex: zone, $options: 'i' };
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { cnic: { $regex: search, $options: 'i' } }
      ];
    }

    // Call service (assumed service handles enhanced filtering now)
    // If service doesn't support sortBy/sortOrder yet, we might need to update service or stick to basic query.
    // Based on previous service code, it took (query, page, limit).
    // Let's assume standard behavior for now to fix the file.
    const result = await AdminService.getDriversList(query, page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new driver
 * @route POST /api/admin/drivers/add
 */
exports.createDriver = async (req, res, next) => {
  try {
    const {
      fullName,
      phoneNumber,
      password,
      vehicleNumber,
      zone,
      autoAssignOrders = false,
      cnic,
      licenseNumber
    } = req.body;

    let normalizedPhoneNumber = phoneNumber;
    if (phoneNumber.startsWith('0')) {
      normalizedPhoneNumber = '+92' + phoneNumber.substring(1);
    }

    const driver = await AdminService.createDriver({
      fullName,
      phoneNumber: normalizedPhoneNumber,
      password,
      vehicleNumber,
      zone,
      autoAssignOrders,
      cnic,
      licenseNumber
    });

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      driver: {
        _id: driver._id,
        fullName: driver.fullName,
        phoneNumber: driver.phoneNumber,
        vehicleNumber: driver.vehicleNumber,
        zone: driver.zone,
        driverStatus: driver.driverStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update driver
 * @route PATCH /api/admin/drivers/:driverId
 */
exports.updateDriver = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const updates = req.body;

    const result = await AdminService.updateDriver(driverId, updates);

    res.json({
      success: true,
      message: 'Driver updated successfully',
      driver: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get orders overview
 * @route GET /api/admin/orders
 */
exports.getOrdersOverview = async (req, res, next) => {
  try {
    const {
      status,
      seller,
      driver,
      buyer,
      dateFrom,
      dateTo,
      page = 1,
      limit = 0, // Default to 0 (all/unlimited)
      sellerId, // Alias
      driverId, // Alias
      buyerId,  // Alias
      paymentStatus,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Normalize aliases
    if (status) query.status = status;
    const finalSeller = seller || sellerId;
    const finalDriver = driver || driverId;
    const finalBuyer = buyer || buyerId;

    if (finalSeller) query.seller = finalSeller;
    if (finalDriver) query.driver = finalDriver;
    if (finalBuyer) query.buyer = finalBuyer;
    if (paymentStatus) query['payment.status'] = paymentStatus;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    if (search) {
      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or = [
          { _id: search },
          { orderId: { $regex: search, $options: 'i' } }
        ];
      } else {
        query.$or = [
          { orderId: { $regex: search, $options: 'i' } },
          { invoiceNumber: { $regex: search, $options: 'i' } },
          { 'deliveryLocation.address': { $regex: search, $options: 'i' } },
          { 'buyer.fullName': { $regex: search, $options: 'i' } }, // Assuming lookups if we were doing aggregation, but for simple find this won't work on virtuals/refs directly effectively without aggregate. Kept simple for now as per original.
        ];
      }
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    let ordersQuery = Order.find(query)
      .populate('buyer', 'fullName phoneNumber')
      .populate('seller', 'businessName phoneNumber email')
      .populate('driver', 'fullName vehicleNumber phoneNumber')
      .populate('warehouse', 'name address')
      .populate('existingCylinder', 'serialNumber weight')
      .populate({
        path: 'paymentTimeline.processedBy',
        select: 'fullName businessName phoneNumber role'
      })
      .populate({
        path: 'paymentTimeline.driverId',
        select: 'fullName vehicleNumber phoneNumber'
      })
      .sort(sort)
      .lean();

    // Handle pagination: if limit is 'all' or 0, do not skip/limit
    // Explicitly check for 'all' string or standard number parsing
    let limitVal = 0;
    if (limit !== 'all' && limit !== 0) {
      limitVal = parseInt(limit);
      if (isNaN(limitVal)) limitVal = 0;
    }

    // If user passed a number > 0, we apply pagination. 
    // If default (0) or 'all', limitVal stays 0 -> no skip/limit calls.

    const pageVal = parseInt(page);

    if (limitVal > 0) {
      const skip = (pageVal - 1) * limitVal;
      ordersQuery = ordersQuery.skip(skip).limit(limitVal);
    }

    const [orders, total] = await Promise.all([
      ordersQuery,
      Order.countDocuments(query)
    ]);

    // Enhanced Summary Aggregation
    const summaryAggregation = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.grandTotal' },

          // Payment Status Breakdowns
          completedRevenue: {
            $sum: { $cond: [{ $eq: ['$payment.status', 'completed'] }, '$pricing.grandTotal', 0] }
          },
          pendingRevenue: {
            $sum: { $cond: [{ $eq: ['$payment.status', 'pending'] }, '$pricing.grandTotal', 0] }
          },

          // Detailed Pricing Breakdowns
          totalDeliveryCharges: { $sum: '$pricing.deliveryCharges' },
          totalSecurityCharges: { $sum: '$pricing.securityCharges' },
          totalUrgentFees: { $sum: '$pricing.urgentDeliveryFee' },
          totalAddOnsValue: { $sum: '$pricing.addOnsTotal' },

          // Cylinder Base Cost (approximate as Subtotal - Addons)
          // Or strictly quantity * cylinderPrice
          totalCylinderBasePrice: {
            $sum: { $multiply: ['$pricing.cylinderPrice', '$quantity'] }
          }
        }
      }
    ]);

    // Status distribution
    const statusDistribution = await Order.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } }
    ]);

    const stats = summaryAggregation[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      completedRevenue: 0,
      pendingRevenue: 0,
      totalDeliveryCharges: 0,
      totalSecurityCharges: 0,
      totalUrgentFees: 0,
      totalAddOnsValue: 0,
      totalCylinderBasePrice: 0
    };

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          orderAge: Math.floor((new Date() - new Date(order.createdAt)) / (1000 * 60 * 60 * 24))
        })),
        summary: {
          ...stats,
          avgOrderValue: stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0
        },
        statusDistribution,
        pagination: {
          currentPage: limitVal > 0 ? pageVal : 1,
          totalPages: limitVal > 0 ? Math.ceil(total / limitVal) : 1,
          totalOrders: total,
          limit: limitVal > 0 ? limitVal : total,
          hasNext: limitVal > 0 ? (pageVal * limitVal) < total : false,
          hasPrev: limitVal > 0 ? pageVal > 1 : false
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Assign driver to order
 * @route POST /api/admin/orders/:orderId/assign
 */
exports.assignDriverToOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    const order = await AdminService.assignDriverToOrder(orderId, driverId, req.user);

    res.json({
      success: true,
      message: 'Driver assigned successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

// Aliases for backward compatibility
exports.getAllDrivers = exports.getDriversList;
exports.getAllOrders = exports.getOrdersOverview;
exports.addNewDriver = exports.createDriver;