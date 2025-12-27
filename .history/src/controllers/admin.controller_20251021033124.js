const User = require('../models/User');
const Order = require('../models/Order');
const Location = require('../models/Location');
const Inventory = require('../models/Inventory');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const NotificationService = require('../services/notification.service');
const { getIO } = require('../config/socket');

exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find admin user
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

    // Generate tokens
    const accessToken = admin.generateAuthToken();
    const refreshToken = admin.generateRefreshToken();

    // Save refresh token
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

exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get counts
    const [
      totalSellers,
      activeSellers,
      pendingSellers,
      totalDrivers,
      activeDrivers,
      totalBuyers,
      totalOrders,
      ordersToday,
      totalRevenue
    ] = await Promise.all([
      User.countDocuments({ role: 'seller' }),
      User.countDocuments({ role: 'seller', sellerStatus: 'approved', isActive: true }),
      User.countDocuments({ role: 'seller', sellerStatus: 'pending' }),
      User.countDocuments({ role: 'driver' }),
      User.countDocuments({ role: 'driver', isActive: true }),
      User.countDocuments({ role: 'buyer', isActive: true }),
      Order.countDocuments(),
      Order.countDocuments({ 
        createdAt: { $gte: today, $lt: tomorrow } 
      }),
      Order.aggregate([
        { $match: { 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
      ])
    ]);

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusMap = {};
    ordersByStatus.forEach(item => {
      statusMap[item._id] = item.count;
    });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('buyer', 'fullName phoneNumber')
      .populate('seller', 'businessName')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      stats: {
        totalSellers,
        activeSellers,
        pendingSellers,
        totalDrivers,
        activeDrivers,
        totalBuyers,
        totalOrders,
        ordersToday,
        revenue: {
          total: totalRevenue[0]?.total || 0
        },
        ordersByStatus: statusMap
      },
      recentOrders
    });
  } catch (error) {
    next(error);
  }
};

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

    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      User.find(query)
        .select('businessName phoneNumber email sellerStatus orgaLicenseNumber createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Get additional stats for each seller
    const sellersWithStats = await Promise.all(
      sellers.map(async (seller) => {
        const [totalOrders, completedOrders, inventory] = await Promise.all([
          Order.countDocuments({ seller: seller._id }),
          Order.countDocuments({ seller: seller._id, status: 'completed' }),
          Inventory.findOne({ seller: seller._id })
        ]);

        return {
          ...seller.toObject(),
          stats: {
            totalOrders,
            completedOrders,
            totalInventory: inventory?.totalInventory || 0
          }
        };
      })
    );

    res.json({
      success: true,
      sellers: sellersWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalSellers: total,
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getSellerDetails = async (req, res, next) => {
  try {
    const { sellerId } = req.params;

    const seller = await User.findById(sellerId);
    if (!seller || seller.role !== 'seller') {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    const [locations, inventory, orders, ratings] = await Promise.all([
      Location.find({ seller: sellerId }),
      Inventory.find({ seller: sellerId }).populate('location'),
      Order.find({ seller: sellerId })
        .populate('buyer', 'fullName phoneNumber')
        .sort({ createdAt: -1 })
        .limit(50),
      Rating.find({ seller: sellerId })
    ]);

    // Calculate stats
    const totalOrders = await Order.countDocuments({ seller: sellerId });
    const completedOrders = await Order.countDocuments({ 
      seller: sellerId, 
      status: 'completed' 
    });
    const totalRevenue = await Order.aggregate([
      { $match: { seller: sellerId, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
    ]);

    res.json({
      success: true,
      seller: {
        ...seller.toObject(),
        locations,
        inventory,
        orders,
        ratings,
        stats: {
          totalOrders,
          completedOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          averageRating: seller.rating.average,
          ratingCount: seller.rating.count
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSellerStatus = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const { status, notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    const seller = await User.findById(sellerId);
    if (!seller || seller.role !== 'seller') {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    seller.sellerStatus = status;
    await seller.save();

    // Send notification to seller
    await NotificationService.createNotification(sellerId, {
      title: `Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: status === 'approved' 
        ? 'Your seller account has been approved. You can now start managing your business.'
        : `Your seller account has been rejected. ${notes || ''}`,
      type: status === 'approved' ? 'seller_approved' : 'seller_rejected',
      data: { notes }
    });

    // EMIT SOCKET EVENT FOR REAL-TIME UPDATE
    const io = getIO();
    if (io) {
      io.to(`seller_${sellerId}`).emit('seller_status_updated', {
        status,
        message: `Your account has been ${status}`,
        timestamp: new Date(),
        notes: notes || null
      });
      
      console.log(`📢 Socket event emitted: seller_status_updated to seller_${sellerId}`);
    }

    res.json({
      success: true,
      message: `Seller account ${status} successfully`,
      seller
    });
  } catch (error) {
    next(error);
  }
};

exports.getDriversList = async (req, res, next) => {
  try {
    const { status, search, zone, page = 1, limit = 20 } = req.query;
    
    const query = { role: 'driver' };
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (zone) query.zone = { $regex: zone, $options: 'i' };
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [drivers, total] = await Promise.all([
      User.find(query)
        .select('fullName phoneNumber vehicleNumber zone driverStatus isActive autoAssignOrders createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Get driver stats
    const driversWithStats = await Promise.all(
      drivers.map(async (driver) => {
        const [assignedOrders, deliveredOrders] = await Promise.all([
          Order.countDocuments({ driver: driver._id }),
          Order.countDocuments({ driver: driver._id, status: 'delivered' })
        ]);

        return {
          ...driver.toObject(),
          stats: {
            assignedOrders,
            deliveredOrders
          }
        };
      })
    );

    res.json({
      success: true,
      drivers: driversWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalDrivers: total,
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.createDriver = async (req, res, next) => {
  try {
    const {
      fullName,
      phoneNumber,
      password,
      vehicleNumber,
      zone,
      autoAssignOrders = false
    } = req.body;

    // Check if driver already exists
    const existingDriver = await User.findOne({
      $or: [{ phoneNumber }, { vehicleNumber }]
    });

    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: 'Driver with this phone number or vehicle number already exists'
      });
    }

    const driver = await User.create({
      role: 'driver',
      phoneNumber,
      password,
      fullName,
      vehicleNumber,
      zone,
      autoAssignOrders,
      isVerified: true,
      driverStatus: 'available'
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

exports.updateDriver = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const updates = req.body;

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Allowed fields to update
    const allowedUpdates = [
      'fullName', 'vehicleNumber', 'zone', 'autoAssignOrders', 
      'driverStatus', 'isActive', 'currentLocation'
    ];
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        driver[key] = updates[key];
      }
    });

    await driver.save();

    res.json({
      success: true,
      message: 'Driver updated successfully',
      driver
    });
  } catch (error) {
    next(error);
  }
};

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
      limit = 20 
    } = req.query;

    const query = {};
    
    if (status) query.status = status;
    if (seller) query.seller = seller;
    if (driver) query.driver = driver;
    if (buyer) query.buyer = buyer;
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('buyer', 'fullName phoneNumber')
        .populate('seller', 'businessName')
        .populate('driver', 'fullName vehicleNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query)
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.assignDriverToOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;

    const [order, driver] = await Promise.all([
      Order.findById(orderId),
      User.findById(driverId)
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!driver || driver.role !== 'driver') {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (!driver.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Driver is not active'
      });
    }

    // Update order
    order.driver = driverId;
    order.status = 'assigned';
    order.statusHistory.push({
      status: 'assigned',
      updatedBy: req.user._id,
      notes: `Driver ${driver.fullName} assigned by admin`
    });
    await order.save();

    // Update driver status
    driver.driverStatus = 'busy';
    await driver.save();

    // Send notifications
    await NotificationService.sendOrderNotification(order, 'order_assigned');

    res.json({
      success: true,
      message: 'Driver assigned successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};