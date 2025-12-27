const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const QRCodeService = require('../services/qrcode.service');
const NotificationService = require('../services/notification.service');
const uploadService = require('../services/upload.service');

const getAssignedOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = { driver: req.user._id };
    if (status) query.status = status;

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
    const {
      cylinderPhoto,
      tareWeight,
      netWeight,
      grossWeight,
      serialNumber,
      weightDifference
    } = req.body;

    const order = await Order.findById(orderId)
      .populate('buyer')
      .populate('seller');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this order'
      });
    }

    if (order.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be accepted in current status'
      });
    }

    // Upload cylinder photo if provided
    let cylinderPhotoUrl = null;
    if (cylinderPhoto) {
      // Assuming cylinderPhoto is base64 or file data
      // This would need to be handled with multer in practice
      cylinderPhotoUrl = await uploadService.uploadImage(
        Buffer.from(cylinderPhoto, 'base64'),
        `cylinder-${orderId}.jpg`,
        'image/jpeg'
      );
    }

    // Update order with cylinder verification
    order.cylinderVerification = {
      photo: cylinderPhotoUrl,
      tareWeight: parseFloat(tareWeight),
      netWeight: parseFloat(netWeight),
      grossWeight: parseFloat(grossWeight),
      serialNumber,
      weightDifference: parseFloat(weightDifference),
      verifiedAt: new Date()
    };
    order.status = 'pickup_ready';
    order.statusHistory.push({
      status: 'pickup_ready',
      updatedBy: req.user._id,
      notes: 'Driver verified cylinder and marked ready for pickup'
    });

    await order.save();

    // Update or create cylinder record
    if (order.orderType === 'new') {
      await Cylinder.findOneAndUpdate(
        { order: orderId },
        {
          weights: {
            tareWeight: parseFloat(tareWeight),
            netWeight: parseFloat(netWeight),
            grossWeight: parseFloat(grossWeight),
            weightDifference: parseFloat(weightDifference)
          },
          cylinderPhoto: cylinderPhotoUrl,
          serialNumber
        },
        { upsert: true, new: true }
      );
    }

    await NotificationService.sendOrderNotification(order, 'order_status_update');

    res.json({
      success: true,
      message: 'Order accepted successfully',
      order
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

    // Generate QR code
    const qrResult = await QRCodeService.generateAndUploadQRCode(order.orderId, {
      cylinderSize: order.cylinderSize,
      driverId: req.user._id,
      type: 'delivery'
    });

    // Update order with QR code
    order.qrCode = qrResult.qrCode;
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

    const order = await Order.findById(orderId)
      .populate('buyer')
      .populate('seller');

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or unauthorized'
      });
    }

    // Verify QR code
    const verification = await QRCodeService.verifyQRCode(qrCode, {
      orderId: order.orderId
    });

    if (!verification.isValid) {
      return res.status(400).json({
        success: false,
        message: verification.reason
      });
    }

    if (order.qrCode !== qrCode) {
      return res.status(400).json({
        success: false,
        message: 'QR code does not match this order'
      });
    }

    // Update order status based on current state
    if (order.status === 'pickup_ready') {
      order.status = 'in_transit';
      order.statusHistory.push({
        status: 'in_transit',
        updatedBy: req.user._id,
        notes: 'Driver scanned QR code and started delivery'
      });

      // Update cylinder location to driver's current location
      await Cylinder.findOneAndUpdate(
        { order: orderId },
        { 
          currentLocation: req.user.currentLocation,
          lastUpdated: new Date()
        }
      );

      await order.save();
      await NotificationService.sendOrderNotification(order, 'order_status_update');

      res.json({
        success: true,
        message: 'Order status updated to in transit',
        order
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'QR code cannot be scanned in current order status'
      });
    }
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
      Order.countDocuments({ driver: driverId, status: 'assigned' }),
      Order.countDocuments({ driver: driverId, status: { $in: ['pickup_ready', 'in_transit'] } }),
      Order.countDocuments({ driver: driverId, status: 'delivered' }),
      Order.countDocuments({ driver: driverId, orderType: 'return', status: { $in: ['return_requested', 'return_pickup'] } }),
      Cylinder.countDocuments({ status: 'empty', seller: { $exists: true } }), // This might need adjustment
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

module.exports = {
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