const User = require('../models/User');
const Order = require('../models/Order');
const Location = require('../models/Location');
const Inventory = require('../models/Inventory');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const NotificationService = require('../services/notification.service');
const { getIO, emitSellerApproval } = require('../config/socket');
const Notification = require('../models/Notification');

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




exports.getDashboardWidgets = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Calculate start date for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // 1. Get counts for FIRST PART
    const [
      totalSellers,
      totalOrders,
      // FIXED: Count ALL orders regardless of payment status
      totalRevenueResult,
      activeDrivers,
      orderStatusCounts,
      monthlyData
    ] = await Promise.all([
      // Total sellers
      User.countDocuments({ role: 'seller' }),

      // Total orders
      Order.countDocuments(),

      // FIXED: Sum grandTotal for ALL orders (not just completed payments)
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.grandTotal' },
            orderCount: { $sum: 1 },
            // Optional: Also get breakdown by payment status
            completedPaymentsRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$payment.status', 'completed'] },
                  '$pricing.grandTotal',
                  0
                ]
              }
            },
            pendingPaymentsRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$payment.status', 'pending'] },
                  '$pricing.grandTotal',
                  0
                ]
              }
            }
          }
        }
      ]),

      // Active drivers (available or busy)
      User.countDocuments({
        role: 'driver',
        driverStatus: { $in: ['available', 'busy'] },
        isActive: true
      }),

      // Get order status counts for orderStatusData
      Order.aggregate([
        {
          $facet: {
            statusCounts: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            totalCount: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]),

      // FIXED: Get monthly data from ALL orders
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            monthlyRevenue: { $sum: '$pricing.grandTotal' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        }
      ])
    ]);

    // 2. Get admin notifications separately
    const adminUsers = await User.find({ role: 'admin' }).select('_id');
    const adminIds = adminUsers.map(admin => admin._id);

    const adminNotifications = await Notification.find({
      user: { $in: adminIds }
    })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'fullName businessName role');

    // Get total revenue from result
    const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;
    const revenueOrdersCount = totalRevenueResult[0]?.orderCount || 0;
    const completedRevenue = totalRevenueResult[0]?.completedPaymentsRevenue || 0;
    const pendingRevenue = totalRevenueResult[0]?.pendingPaymentsRevenue || 0;

    // DEBUG: Log to check
    console.log('=== REVENUE DEBUG INFO ===');
    console.log('Total Orders in system:', totalOrders);
    console.log('Total Revenue (all orders):', totalRevenue);
    console.log('Revenue from completed payments:', completedRevenue);
    console.log('Revenue from pending payments:', pendingRevenue);
    console.log('Number of orders counted for revenue:', revenueOrdersCount);

    // Let's also debug a few sample orders
    const sampleOrders = await Order.find().limit(3).select('orderId pricing.grandTotal payment.status');
    console.log('Sample orders:', sampleOrders.map(o => ({
      orderId: o.orderId,
      grandTotal: o.pricing.grandTotal,
      paymentStatus: o.payment.status
    })));

    // Process order status data
    const statusData = orderStatusCounts[0] || { statusCounts: [], totalCount: [{ total: 0 }] };
    const totalOrdersCount = statusData.totalCount[0]?.total || 0;

    // Define how to group order statuses
    const statusCategories = {
      'pending': 'Pending',
      'assigned': 'In Progress',
      'in_transit': 'In Progress',
      'pickup_ready': 'In Progress',
      'qrgenerated': 'In Progress',
      'accepted': 'In Progress',
      'delivered': 'Delivered',
      'completed': 'Delivered'
    };

    const statusAggregates = {};

    statusData.statusCounts.forEach(item => {
      let category = 'Other';

      if (statusCategories[item._id]) {
        category = statusCategories[item._id];
      }

      if (!statusAggregates[category]) {
        statusAggregates[category] = 0;
      }
      statusAggregates[category] += item.count;
    });

    // Create the orderStatusData array
    const formattedOrderStatusData = [];

    // Add Delivered status
    if (statusAggregates['Delivered']) {
      formattedOrderStatusData.push({
        status: 'Delivered',
        count: statusAggregates['Delivered'],
        percentage: Math.round((statusAggregates['Delivered'] / totalOrdersCount) * 100 * 10) / 10
      });
    }

    // Add In Progress status
    if (statusAggregates['In Progress']) {
      formattedOrderStatusData.push({
        status: 'In Progress',
        count: statusAggregates['In Progress'],
        percentage: Math.round((statusAggregates['In Progress'] / totalOrdersCount) * 100 * 10) / 10
      });
    }

    // Add Pending status
    if (statusAggregates['Pending']) {
      formattedOrderStatusData.push({
        status: 'Pending',
        count: statusAggregates['Pending'],
        percentage: Math.round((statusAggregates['Pending'] / totalOrdersCount) * 100 * 10) / 10
      });
    }

    // Format monthly data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const monthlyOrderData = monthlyData.map(item => ({
      month: monthNames[item._id.month - 1],
      orders: item.orderCount,
      revenue: item.monthlyRevenue
    }));

    // Ensure we have exactly 6 months of data
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = monthNames[date.getMonth()];

      const existingData = monthlyOrderData.find(m => m.month === monthName);
      last6Months.push({
        month: monthName,
        orders: existingData ? existingData.orders : 0
      });
    }

    // Format admin notifications
    const recentNotifications = adminNotifications.map(notif => ({
      id: notif._id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      isRead: notif.isRead,
      createdAt: notif.createdAt,
      user: notif.user ? {
        name: notif.user.fullName || notif.user.businessName,
        role: notif.user.role
      } : null
    }));

    res.json({
      success: true,
      stats: {
        // FIRST PART: Your 4 main stats
        totalSellers,
        totalOrders,
        totalRevenue: totalRevenue, // Now shows ALL revenue
        activeDrivers,

        // SECOND PART: Monthly trends and status breakdown
        monthlyOrderData: last6Months,
        orderStatusData: formattedOrderStatusData,

        // Admin notifications only
        recentNotifications,

        // Debug info (optional - can remove)
        _debug: {
          totalOrders: totalOrders,
          revenueBreakdown: {
            total: totalRevenue,
            fromCompletedPayments: completedRevenue,
            fromPendingPayments: pendingRevenue
          }
        }
      }
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
        .select('businessName phoneNumber email sellerStatus orgaLicenseNumber createdAt ')
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

    if (!['approved', 'rejected','pending'].includes(status)) {
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

    // ✅ Update status and save
    seller.sellerStatus = status;
    await seller.save();

    // ✅ Create notification
    await NotificationService.createNotification(sellerId, {
      title: `Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message:
          status === 'approved'
              ? 'Your seller account has been approved. You can now start managing your business.'
              : `Your seller account has been rejected. ${notes || ''}`,
      type: status === 'approved' ? 'seller_approved' : 'seller_rejected',
      data: { notes }
    });

    // ✅ Emit real-time socket event (uses your existing socket helper)
    emitSellerApproval(sellerId, status);
    console.log(`📢 Seller approval event emitted for ${sellerId} (${status})`);

    // ✅ Response
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




exports.addNewDriver = async (req, res, next) => {
  try {
    const {
      fullName,
      password,
      vehicleNumber,
      phoneNumber,
      zone,
      cnic,
      autoAssignOrders,
      licenseNumber,
    } = req.body;
    let normalizedPhoneNumber = phoneNumber;

    if (phoneNumber.startsWith('0')) {
      normalizedPhoneNumber = '+92' + phoneNumber.substring(1);
    }
    // 1. Check if Driver already exists (Phone, Vehicle, or CNIC)
    // We check these manually to provide specific error messages
    const existingDriver = await User.findOne({
      $or: [
        { phoneNumber: normalizedPhoneNumber },
        { vehicleNumber: vehicleNumber },
        { cnic: cnic }
      ]
    });

    if (existingDriver) {
      let message = 'Driver already exists.';
      if (existingDriver.phoneNumber === normalizedPhoneNumber) message = 'Phone number already in use.';
      else if (existingDriver.vehicleNumber === vehicleNumber) message = 'Vehicle number already registered.';
      else if (existingDriver.cnic === cnic) message = 'CNIC already registered.';

      return res.status(400).json({
        success: false,
        message
      });
    }

    // 2. Create the Driver
    // Note: We assume your User Schema 'pre-save' hook handles password hashing.
    // Ensure the hashing logic in your Schema is uncommented.
    const driver = await User.create({
      role: 'driver',
      fullName,
      phoneNumber:normalizedPhoneNumber,
      password,
      vehicleNumber,
      zone,
      cnic,
      autoAssignOrders,
      licenseNumber,
      isActive: true,       // Admin created, so active by default
      isVerified: true,     // Admin created, so verified by default
      driverStatus: 'available',
// Default setting
    });

    res.status(201).json({
      success: true,
      message: 'Driver added successfully',
      driver: {
        _id: driver._id,
        fullName: driver.fullName,
        phoneNumber: driver.phoneNumber,
        vehicleNumber: driver.vehicleNumber,
        zone: driver.zone,
        cnic: driver.cnic,
        driverStatus: driver.driverStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllDrivers = async (req, res, next) => {
  try {
    const {
      status,
      search,
      zone,
      driverStatus,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { role: 'driver' };

    // Apply filters
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [drivers, total] = await Promise.all([
      User.find(query)
          .select('fullName phoneNumber email vehicleNumber zone cnic driverStatus isActive autoAssignOrders createdAt lastActive')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
      User.countDocuments(query)
    ]);

    // Get additional stats for each driver
    const driversWithStats = await Promise.all(
        drivers.map(async (driver) => {
          const [totalOrders, deliveredOrders, currentAssignedOrders, ratings] = await Promise.all([
            Order.countDocuments({ driver: driver._id }),
            Order.countDocuments({ driver: driver._id, status: 'delivered' }),
            Order.countDocuments({
              driver: driver._id,
              status: { $in: ['assigned', 'in_transit', 'pickup_ready', 'accepted'] }
            }),
            Rating.find({ driver: driver._id })
          ]);

          // Calculate average rating
          const averageRating = ratings.length > 0
              ? ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length
              : 0;

          return {
            ...driver,
            stats: {
              totalOrders,
              deliveredOrders,
              currentAssignedOrders,
              deliveryRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0,
              averageRating: Math.round(averageRating * 10) / 10,
              ratingCount: ratings.length
            }
          };
        })
    );

    res.json({
      success: true,
      data: {
        drivers: driversWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalDrivers: total,
          limit: parseInt(limit),
          hasNext: (page * limit) < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const {
      status,
      sellerId,
      driverId,
      buyerId,
      dateFrom,
      dateTo,
      paymentStatus,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (sellerId) query.seller = sellerId;
    if (driverId) query.driver = driverId;
    if (buyerId) query.buyer = buyerId;
    if (paymentStatus) query['payment.status'] = paymentStatus;

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Search filter
    if (search) {
      // Check if search is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or = [
          { _id: search },
          { orderId: { $regex: search, $options: 'i' } }
        ];
      } else {
        query.$or = [
          { orderId: { $regex: search, $options: 'i' } },
          { invoiceNumber: { $regex: search, $options: 'i' } },
          { 'deliveryLocation.address': { $regex: search, $options: 'i' } }
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get orders with proper population
    const [orders, total] = await Promise.all([
      Order.find(query)
          .populate('buyer', 'fullName phoneNumber')
          .populate('seller', 'businessName phoneNumber email')
          .populate('driver', 'fullName vehicleNumber phoneNumber')
          .populate('warehouse', 'name address') // Added warehouse population
          .populate('existingCylinder', 'serialNumber weight') // Added cylinder population
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
      Order.countDocuments(query)
    ]);

    // Get summary statistics
    const summary = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.grandTotal' },
          completedRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$payment.status', 'completed'] },
                '$pricing.grandTotal',
                0
              ]
            }
          },
          pendingRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$payment.status', 'pending'] },
                '$pricing.grandTotal',
                0
              ]
            }
          },
          avgOrderValue: { $avg: '$pricing.grandTotal' },
          totalCylinders: { $sum: '$quantity' }
        }
      }
    ]);

    // Get status distribution
    const statusDistribution = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Get payment method distribution
    const paymentMethodDistribution = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$payment.method',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          method: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Format orders for response
    const formattedOrders = orders.map(order => {
      // Calculate order age in days
      const createdAt = new Date(order.createdAt);
      const now = new Date();
      const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

      // Get cylinder size display name
      const cylinderSizeMap = {
        '15kg': '15kg Cylinder',
        '11.8kg': '11.8kg Cylinder',
        '6kg': '6kg Cylinder',
        '4.5kg': '4.5kg Cylinder'
      };

      // Get order type display name
      const orderTypeMap = {
        'new': 'New Cylinder',
        'refill': 'Refill',
        'return': 'Return',
        'supplier_change': 'Supplier Change'
      };

      // Calculate driver earnings
      const totalDriverEarnings = order.driverEarnings?.reduce((sum, earning) => sum + (earning.amount || 0), 0) || 0;

      return {
        ...order,
        orderAge: ageInDays,
        cylinderSizeDisplay: cylinderSizeMap[order.cylinderSize] || order.cylinderSize,
        orderTypeDisplay: orderTypeMap[order.orderType] || order.orderType,
        totalDriverEarnings,
        deliveryAddress: order.deliveryLocation?.address || 'N/A',
        pickupAddress: order.pickupLocation?.address || 'N/A',
        // Calculate if payment is overdue (pending for more than 3 days)
        paymentOverdue: order.payment?.status === 'pending' && ageInDays > 3,
        // Calculate days overdue
        daysOverdue: order.payment?.status === 'pending' && ageInDays > 3 ? ageInDays - 3 : 0
      };
    });

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        summary: summary[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          completedRevenue: 0,
          pendingRevenue: 0,
          avgOrderValue: 0,
          totalCylinders: 0
        },
        statusDistribution,
        paymentMethodDistribution,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalOrders: total,
          limit: parseInt(limit),
          hasNext: (page * limit) < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error in getAllOrders:', error);
    next(error);
  }
};