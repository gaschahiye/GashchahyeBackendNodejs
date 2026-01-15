const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const QRCodeService = require('../services/qrcode.service');
const NotificationService = require('../services/notification.service');
const uploadService = require('../services/upload.service');
const jwt = require("jsonwebtoken");

const getAssignedOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { driver: req.user._id };

    // 🔥 Handle "assigned" → return assigned + qrgenerated
    if (status === "assigned") {
      query.status = { $in: ["assigned", "qrgenerated", "accepted"] };
    } else if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('buyer', 'fullName phoneNumber addresses')
        .populate('seller', 'businessName phoneNumber')
        .populate('existingCylinder', 'serialNumber customName')
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
        totalOrders: total
      }
    });
  } catch (error) {
    next(error);
  }
};


const acceptOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { cylinders } = req.body; // Expecting an array of cylinder objects

    const order = await Order.findById(orderId)
      .populate('buyer')
      .populate('seller');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to accept this order' });
    }

    if (order.status !== 'assigned') {
      return res.status(400).json({ success: false, message: 'Order cannot be accepted in current status' });
    }

    if (!cylinders || !Array.isArray(cylinders) || cylinders.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least one cylinder verification' });
    }

    // Reset verification array
    order.cylinderVerification = [];

    // Determine cylinder location (common for all)
    let cylinderLocation = {
      type: 'Point',
      coordinates: [0, 0] // fallback
    };
    if (order.deliveryLocation?.location?.coordinates?.length === 2) {
      cylinderLocation.coordinates = order.deliveryLocation.location.coordinates;
    }

    // Calculate security fee per cylinder
    const perCylinderSecurity = order.quantity > 0
      ? (order.pricing.securityCharges / order.quantity)
      : order.pricing.securityCharges;

    // Iterate over cylinders
    for (const [index, cyl] of cylinders.entries()) {
      const {
        cylinderPhoto,
        tareWeight,
        netWeight,
        grossWeight,
        serialNumber,
        weightDifference
      } = cyl;

      // Upload cylinder photo if provided
      let cylinderPhotoUrl = null;
      if (cylinderPhoto) {
        cylinderPhotoUrl = await uploadService.uploadImage(
          Buffer.from(cylinderPhoto, 'base64'),
          `cylinder-${orderId}-${index + 1}.jpg`,
          'image/jpeg'
        );
      }

      // Add to verification array
      order.cylinderVerification.push({
        photo: cylinderPhotoUrl,
        tareWeight: parseFloat(tareWeight),
        netWeight: parseFloat(netWeight),
        grossWeight: parseFloat(grossWeight),
        serialNumber,
        weightDifference: parseFloat(weightDifference),
        verifiedAt: new Date()
      });

      // Update or create Cylinder if it's a new order
      if (order.orderType === 'new') {
        await Cylinder.findOneAndUpdate(
          { serialNumber: serialNumber },
          {
            weights: {
              tareWeight: parseFloat(tareWeight),
              netWeight: parseFloat(netWeight),
              grossWeight: parseFloat(grossWeight),
              weightDifference: parseFloat(weightDifference)
            },
            cylinderPhoto: cylinderPhotoUrl,
            // serialNumber is in filter
            seller: order.seller._id,
            SellerName: order.seller.businessName,
            buyer: order.buyer?._id || null,
            securityFee: perCylinderSecurity,
            order: order._id,
            size: order.cylinderSize,
            currentLocation: cylinderLocation,
            warehouse: order.warehouse,
            qrCode: `${order._id}-${index + 1}`, // Generate unique QR for each cylinder
          },
          { upsert: true, new: true }
        );
      }
    }

    order.status = 'accepted';
    order.statusHistory.push({
      status: 'accepted',
      updatedBy: req.user._id,
      notes: `Driver verified ${cylinders.length} cylinders and accepted the order`
    });

    order.qrCode = orderId;
    await order.save();

    await NotificationService.sendOrderNotification(order, 'order_status_update');

    res.json({
      success: true,
      message: 'Order accepted successfully',
      // order
    });
  } catch (error) {
    next(error);
  }
};


const generateQRCode = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to generate QR for this order'
      });
    }

    console.log(order);
    // Generate QR code
    const qrResult = await QRCodeService.generateAndUploadQRCode(orderId);

    // Update order with QR code
    order.qrCode = qrResult.qrCode;
    order.qrCodeUrl = qrResult.qrCodeUrl;
    order.status = 'qrgenerated';
    await order.save();

    // Update cylinder with QR code if it exists
    await Cylinder.findOneAndUpdate(
      { order: orderId },
      { qrCode: qrResult.qrCode }
    );

    res.json({
      success: true,
      message: 'QR code generated successfully',
      qrCode: qrResult.qrCode,
      qrCodeUrl: qrResult.qrCodeUrl,
      qrCodeDataURL: qrResult.qrCodeDataURL
    });
  } catch (error) {
    next(error);
  }
};

const printQRCode = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or unauthorized'
      });
    }

    if (!order.qrCode) {
      return res.status(400).json({
        success: false,
        message: 'QR code not generated for this order'
      });
    }

    order.qrCodePrintedAt = new Date();
    order.statusHistory.push({
      status: order.status, // Maintain current status
      updatedBy: req.user._id,
      notes: 'QR code printed and placed on cylinder'
    });
    await order.save();

    res.json({
      success: true,
      message: 'QR code marked as printed',
      printedAt: order.qrCodePrintedAt
    });
  } catch (error) {
    next(error);
  }
};

const scanQRCode = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { qrCode } = req.body;

    const order = await Order.findById(orderId);

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    // Simple verification
    if (order.qrCode !== qrCode) {
      return res.status(400).json({ success: false, message: 'QR code does not match this order' });
    }

    // Update order status
    if (['pickup_ready', 'qrgenerated', 'assigned', 'refill_requested', 'return_requested'].includes(order.status)) {
      order.status = 'in_transit';
      order.statusHistory.push({
        status: 'in_transit',
        updatedBy: req.user._id,
        notes: 'Driver scanned QR code and started delivery'
      });

      await Cylinder.findOneAndUpdate(
        { order: orderId },
        { currentLocation: req.user.currentLocation, lastUpdated: new Date() }
      );

      await order.save();
      await NotificationService.sendOrderNotification(order, 'order_status_update');

      res.json({ success: true, message: 'Order status updated to in transit', order });
    } else if (['in_transit'].includes(order.status) && ['refill'].includes(order.orderType)) {
      order.status = 'refill_in_store';
      order.orderType = 'new';
      order.statusHistory.push({
        status: 'delivered',
        updatedBy: req.user._id,
        notes: 'Driver scanned QR code And Deliverd the cylinder to the Store for refill '
      });

      await Cylinder.findOneAndUpdate(
        { order: orderId },
        { currentLocation: req.user.currentLocation, lastUpdated: new Date() }
      );

      await order.save();
      await NotificationService.sendOrderNotification(order, 'order_status_update');

      res.json({ success: true, message: 'Order status updated to in transit', order });
    }
    else if (['in_transit'].includes(order.status) && ['new'].includes(order.orderType)) {
      order.status = 'delivered';
      // order.orderType = 'refill';
      order.statusHistory.push({
        status: 'delivered',
        updatedBy: req.user._id,
        notes: 'Driver scanned QR code and Delivered the cylinder on location'
      });

      await Cylinder.findOneAndUpdate(
        { order: orderId },
        { currentLocation: req.user.currentLocation, lastUpdated: new Date() }
      );

      await order.save();
      await NotificationService.sendOrderNotification(order, 'delivery_confirmed');

      res.json({ success: true, message: 'Order status updated to in transit', order });
    }
    else if (['in_transit'].includes(order.status) && ['return'].includes(order.orderType)) {
      order.status = 'completed';
      order.orderType = 'refill';
      order.statusHistory.push({
        status: 'Returned',
        updatedBy: req.user._id,
        notes: 'Cylinder has been succesfully delivered to the store'
      });

      await Cylinder.findOneAndUpdate(
        { order: orderId },
        { currentLocation: req.user.currentLocation, lastUpdated: new Date() }
      );

      await order.save();
      await NotificationService.sendOrderNotification(order, 'order_status_update');

      res.json({ success: true, message: 'Order status updated to in transit', order });
    }
    else {
      res.status(400).json({ success: false, message: 'QR code cannot be scanned in current order status' });
    }
  } catch (error) {
    next(error);
  }
};
const scanQRCodeForDelivery = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { qrCode } = req.body;

    const order = await Order.findById(orderId);

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    // Simple verification
    if (order.qrCode !== qrCode) {
      return res.status(400).json({ success: false, message: 'QR code does not match this order' });
    }

    res.json({ success: true, message: 'QrCode Matched successfully', order });

  } catch (error) {
    next(error);
  }
};

const updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      currentLocation: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      }
    });

    // Update any in-transit cylinders
    const inTransitOrders = await Order.find({
      driver: req.user._id,
      status: 'in_transit'
    });

    for (const order of inTransitOrders) {
      await Cylinder.findOneAndUpdate(
        { order: order._id },
        {
          currentLocation: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          lastUpdated: new Date()
        }
      );
    }

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const completeDelivery = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { notes, deliveryPhoto } = req.body;

    const order = await Order.findById(orderId)
      .populate('buyer')
      .populate('seller');

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or unauthorized'
      });
    }

    if (order.status !== 'in_transit') {
      return res.status(400).json({
        success: false,
        message: 'Order must be in transit to complete delivery'
      });
    }

    // Upload delivery photo if provided
    let deliveryPhotoUrl = null;
    if (deliveryPhoto) {
      deliveryPhotoUrl = await uploadService.uploadImage(
        Buffer.from(deliveryPhoto, 'base64'),
        `delivery-${orderId}.jpg`,
        'image/jpeg'
      );
    }

    order.status = 'delivered';
    order.actualDeliveryTime = new Date();
    order.driverNotes = notes;
    if (deliveryPhotoUrl) {
      order.deliveryPhoto = deliveryPhotoUrl;
    }

    order.statusHistory.push({
      status: 'delivered',
      updatedBy: req.user._id,
      notes: `Delivery completed${notes ? ': ' + notes : ''}`
    });

    await order.save();

    // Update driver status to available
    await User.findByIdAndUpdate(req.user._id, {
      driverStatus: 'available'
    });

    // Update cylinder status and location
    await Cylinder.findOneAndUpdate(
      { order: orderId },
      {
        status: 'active',
        currentLocation: order.deliveryLocation.location,
        lastUpdated: new Date()
      }
    );

    await NotificationService.sendOrderNotification(order, 'delivery_confirmed');

    res.json({
      success: true,
      message: 'Delivery completed successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

const getDriverDashboard = async (req, res, next) => {
  try {
    const driverId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      newOrders,
      inProcessOrders,
      deliveredOrders,
      returnRequests,
      emptyCylinders,
      todaysOrders
    ] = await Promise.all([
      Order.countDocuments({ driver: driverId, status: { $in: ['assigned', 'qrgenerated', 'accepted'] } }),
      Order.countDocuments({ driver: driverId, status: { $in: ['in_transit'] } }),
      Order.countDocuments({ driver: driverId, status: 'delivered' }),
      Order.countDocuments({ driver: driverId, orderType: 'return', status: { $in: ['return_requested', 'return_pickup'] } }),
      Order.countDocuments({ driver: driverId, orderType: 'refill', status: { $in: ['refill_requested'] } }), // This might need adjustment
      Order.find({
        driver: driverId,
        createdAt: { $gte: today }
      })
        .populate('buyer', 'fullName phoneNumber')
        .populate('seller', 'businessName')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    res.json({
      success: true,
      stats: {
        newOrders,
        inProcessOrders,
        deliveredOrders,
        returnRequests,
        emptyCylinders
      },
      todaysOrders
    });
  } catch (error) {
    next(error);
  }
};

const updateDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be available, busy, or offline'
      });
    }

    const driver = await User.findByIdAndUpdate(
      req.user._id,
      { driverStatus: status },
      { new: true }
    );

    res.json({
      success: true,
      message: `Driver status updated to ${status}`,
      status: driver.driverStatus
    });
  } catch (error) {
    next(error);
  }
};


const login = async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body;

    // 1. Find the driver by Phone Number
    // We explicitly select '+password' because it's usually excluded by default
    const driver = await User.findOne({
      phoneNumber,
      role: 'driver'
    }).select('+password');

    // 2. Validate Driver and Password
    if (!driver || !(await driver.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // 3. Check if account is active
    if (!driver.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your driver account is deactivated. Please contact admin.'
      });
    }

    // 4. Generate Tokens (using methods defined in User Schema)
    const accessToken = driver.generateAuthToken();
    const refreshToken = driver.generateRefreshToken();

    // 5. Save Refresh Token to DB
    driver.refreshToken = refreshToken;

    // Auto-update status to 'available' on login if currently offline
    if (driver.driverStatus === 'offline') {
      driver.driverStatus = 'available';
    }

    await driver.save();

    // 6. Send Response
    res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      driver: {
        _id: driver._id,
        fullName: driver.fullName,
        phoneNumber: driver.phoneNumber,
        vehicleNumber: driver.vehicleNumber,
        zone: driver.zone,
        driverStatus: driver.driverStatus,
        role: driver.role
      }
    });
  } catch (error) {
    next(error);
  }
};
const getMe = async (req, res, next) => {
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
    // We use findById and select to fetch only the necessary driver fields.
    const driver = await User.findById(decoded.userId)
      .select(
        'fullName phoneNumber email role isActive isVerified language ' +
        'vehicleNumber zone autoAssignOrders driverStatus currentLocation fcmToken ' +
        'cnic' // CNIC is useful for identity verification
      )
      .lean(); // .lean() converts the Mongoose document to a plain JavaScript object for performance

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    // Explicitly exclude any highly sensitive fields that might slip through
    // (though 'select' should handle it, this is an extra layer of safety)
    delete driver.refreshToken;

    res.json({
      success: true,
      driver: driver
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  scanQRCodeForDelivery,
  login,
  getMe,
  getAssignedOrders,
  acceptOrder,
  generateQRCode,
  printQRCode,
  scanQRCode,
  updateLocation,
  completeDelivery,
  getDriverDashboard,
  updateDriverStatus
};