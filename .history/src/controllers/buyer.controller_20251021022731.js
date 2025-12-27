const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const Inventory = require('../models/Inventory');
const { findNearbySellers } = require('../services/geolocation.service');
const { processJazzCashPayment, processEasyPaisaPayment } = require('../services/payment.service');
const { sendNotification } = require('../services/notification.service');
const { getIO } = require('../config/socket');
const logger = require('../utils/logger');

// Add/Update Address
exports.addAddress = async (req, res, next) => {
  try {
    const { label, address, location, isDefault } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (isDefault) {
      user.addresses.forEach(addr => addr.isDefault = false);
    }
    
    user.addresses.push({
      label,
      address,
      location: {
        type: 'Point',
        coordinates: location.coordinates
      },
      isDefault: isDefault || user.addresses.length === 0
    });
    
    await user.save();
    
    res.json({
      success: true,
      address: user.addresses[user.addresses.length - 1]
    });
  } catch (error) {
    next(error);
  }
};

// Get Nearby Sellers
exports.getNearbySellers = async (req, res, next) => {
  try {
    const { lat, lng, radius, sortBy } = req.query;
    
    const sellers = await findNearbySellers(
      parseFloat(lat),
      parseFloat(lng),
      parseInt(radius) || 5000,
      sortBy || 'distance'
    );
    
    res.json({
      success: true,
      sellers
    });
  } catch (error) {
    next(error);
  }
};

// Get Seller Details
exports.getSellerDetails = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    
    const seller = await User.findById(sellerId)
      .select('businessName phoneNumber rating');
    
    if (!seller || seller.role !== 'seller') {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    const Location = require('../models/Location');
    const locations = await Location.find({ seller: sellerId, isActive: true });
    
    const inventory = await Inventory.find({ seller: sellerId, isActive: true })
      .populate('location');
    
    res.json({
      success: true,
      seller: {
        ...seller.toObject(),
        locations,
        inventory
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create Order
exports.createOrder = async (req, res, next) => {
  try {
    const {
      seller,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation,
      addOns,
      isUrgent,
      payment
    } = req.body;
    
    // Check inventory
    const inventory = await Inventory.findOne({ seller, isActive: true });
    
    if (!inventory || inventory.cylinders[cylinderSize].quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient inventory'
      });
    }
    
    // Calculate pricing
    const cylinderPrice = inventory.cylinders[cylinderSize].price * quantity;
    const deliveryCharges = isUrgent ? 200 : 100;
    const urgentDeliveryFee = isUrgent ? 150 : 0;
    const addOnsTotal = addOns ? addOns.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;
    
    const orderData = {
      buyer: req.user._id,
      seller,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation: {
        address: deliveryLocation.address,
        location: {
          type: 'Point',
          coordinates: deliveryLocation.location.coordinates
        }
      },
      addOns,
      isUrgent,
      pricing: {
        cylinderPrice,
        securityCharges: orderType === 'new' ? 500 : 0,
        deliveryCharges,
        urgentDeliveryFee,
        addOnsTotal,
        subtotal: cylinderPrice + addOnsTotal,
        grandTotal: 0 // Will be calculated in pre-save hook
      },
      payment: {
        method: payment.method,
        status: 'pending'
      }
    };
    
    const order = await Order.create(orderData);
    
    // Process payment
    let paymentResult;
    if (payment.method === 'jazzcash') {
      paymentResult = await processJazzCashPayment(order);
    } else if (payment.method === 'easypaisa') {
      paymentResult = await processEasyPaisaPayment(order);
    } else if (payment.method === 'cod') {
      paymentResult = { success: true, transactionId: `COD-${Date.now()}` };
    }
    
    if (paymentResult.success) {
      order.payment.status = payment.method === 'cod' ? 'pending' : 'completed';
      order.payment.transactionId = paymentResult.transactionId;
      await order.save();
      
      // Update inventory
      inventory.cylinders[cylinderSize].quantity -= quantity;
      inventory.issuedCylinders += quantity;
      await inventory.save();
      
      // Notify seller
      const io = getIO();
      io.to(`seller_${seller}`).emit('new_order', order);
      
      await sendNotification(seller, {
        title: 'New Order',
        message: `New order ${order.orderId} received`,
        type: 'order_created',
        relatedOrder: order._id
      });
      
      res.status(201).json({
        success: true,
        order,
        paymentUrl: paymentResult.paymentUrl
      });
    } else {
      await Order.findByIdAndDelete(order._id);
      return res.status(400).json({
        success: false,
        message: 'Payment failed',
        error: paymentResult.error
      });
    }
  } catch (error) {
    next(error);
  }
};

// Get My Cylinders
exports.getMyCylinders = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const query = { buyer: req.user._id };
    if (status) query.status = status;
    
    const cylinders = await Cylinder.find(query)
      .populate('seller', 'businessName phoneNumber rating')
      .populate('order', 'orderId status')
      .sort('-createdAt');
    
    res.json({
      success: true,
      cylinders
    });
  } catch (error) {
    next(error);
  }
};

// Request Refill
exports.requestRefill = async (req, res, next) => {
  try {
    const { cylinderId, newSize, changeSeller } = req.body;
    
    const cylinder = await Cylinder.findById(cylinderId).populate('seller');
    
    if (!cylinder || cylinder.buyer.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }
    
    if (changeSeller) {
      return res.json({
        success: true,
        message: 'Please select a new seller',
        requiresReturn: true
      });
    }
    
    // Get buyer's default address
    const buyer = await User.findById(req.user._id);
    const defaultAddress = buyer.addresses.find(addr => addr.isDefault) || buyer.addresses[0];
    
    const inventory = await Inventory.findOne({ 
      seller: cylinder.seller._id, 
      isActive: true 
    });
    
    const size = newSize || cylinder.size;
    
    const order = await Order.create({
      buyer: req.user._id,
      seller: cylinder.seller._id,
      orderType: 'refill',
      cylinderSize: size,
      quantity: 1,
      existingCylinder: cylinderId,
      pickupLocation: {
        address: defaultAddress.address,
        location: defaultAddress.location
      },
      deliveryLocation: {
        address: defaultAddress.address,
        location: defaultAddress.location
      },
      status: 'refill_requested',
      pricing: {
        cylinderPrice: inventory.cylinders[size].price,
        deliveryCharges: 100,
        urgentDeliveryFee: 0,
        securityCharges: 0,
        addOnsTotal: 0,
        subtotal: inventory.cylinders[size].price,
        grandTotal: inventory.cylinders[size].price + 100
      },
      payment: {
        method: 'cod',
        status: 'pending'
      }
    });
    
    cylinder.status = 'in_refill';
    await cylinder.save();
    
    const io = getIO();
    io.to(`seller_${cylinder.seller._id}`).emit('refill_request', order);
    
    res.json({
      success: true,
      order
    });
  } catch (error) {
    next(error);
  }
};

// Request Return
exports.requestReturn = async (req, res, next) => {
  try {
    const { cylinderId, rating } = req.body;
    
    const cylinder = await Cylinder.findById(cylinderId).populate('seller');
    
    if (!cylinder || cylinder.buyer.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }
    
    // Create rating
    if (rating) {
      await Rating.create({
        order: cylinder.order,
        buyer: req.user._id,
        seller: cylinder.seller._id,
        stars: rating.stars,
        description: rating.description,
        type: 'return'
      });
    }
    
    const Location = require('../models/Location');
    const sellerLocation = await Location.findOne({ 
      seller: cylinder.seller._id, 
      isActive: true 
    });
    
    const buyer = await User.findById(req.user._id);
    const defaultAddress = buyer.addresses.find(addr => addr.isDefault) || buyer.addresses[0];
    
    const order = await Order.create({
      buyer: req.user._id,
      seller: cylinder.seller._id,
      orderType: 'return',
      cylinderSize: cylinder.size,
      quantity: 1,
      existingCylinder: cylinderId,
      pickupLocation: {
        address: defaultAddress.address,
        location: defaultAddress.location
      },
      deliveryLocation: {
        address: sellerLocation.address,
        location: sellerLocation.location
      },
      status: 'return_requested',
      rating: rating ? {
        stars: rating.stars,
        description: rating.description,
        ratedAt: new Date()
      } : undefined,
      pricing: {
        cylinderPrice: 0,
        deliveryCharges: 0,
        urgentDeliveryFee: 0,
        securityCharges: 0,
        addOnsTotal: 0,
        subtotal: 0,
        grandTotal: 0
      },
      payment: {
        method: 'cod',
        status: 'completed'
      }
    });
    
    cylinder.status = 'returned';
    await cylinder.save();
    
    const io = getIO();
    io.to(`seller_${cylinder.seller._id}`).emit('return_request', order);
    
    res.json({
      success: true,
      order
    });
  } catch (error) {
    next(error);
  }
};

// Update Cylinder Name
exports.updateCylinderName = async (req, res, next) => {
  try {
    const { cylinderId } = req.params;
    const { customName } = req.body;
    
    const cylinder = await Cylinder.findOneAndUpdate(
      { _id: cylinderId, buyer: req.user._id },
      { customName },
      { new: true }
    );
    
    if (!cylinder) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }
    
    res.json({
      success: true,
      cylinder
    });
  } catch (error) {
    next(error);
  }
};

// Submit Rating
exports.submitRating = async (req, res, next) => {
  try {
    const { orderId, stars, description, type } = req.body;
    
    const order = await Order.findById(orderId);
    
    if (!order || order.buyer.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    const rating = await Rating.create({
      order: orderId,
      buyer: req.user._id,
      seller: order.seller,
      stars,
      description,
      type
    });
    
    order.rating = {
      stars,
      description,
      ratedAt: new Date()
    };
    await order.save();
    
    res.json({
      success: true,
      rating
    });
  } catch (error) {
    next(error);
  }
};

// Get Order History
exports.getOrderHistory = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { buyer: req.user._id };
    if (status) query.status = status;
    
    const orders = await Order.find(query)
      .populate('seller', 'businessName phoneNumber')
      .populate('driver', 'fullName phoneNumber vehicleNumber')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Order.countDocuments(query);
    
    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalOrders: count
      }
    });
  } catch (error) {
    next(error);
  }
};

// Track Order
exports.trackOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('seller', 'businessName phoneNumber')
      .populate('driver', 'fullName phoneNumber vehicleNumber currentLocation');
    
    if (!order || order.buyer.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    res.json({
      success: true,
      order
    });
  } catch (error) {
    next(error);
  }
};

// Scan QR Code (Delivery Confirmation)
exports.scanQRCode = async (req, res, next) => {
  try {
    const { qrCode } = req.body;
    
    const order = await Order.findOne({ qrCode })
      .populate('driver', 'fullName phoneNumber');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Invalid QR code'
      });
    }
    
    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    if (order.status !== 'in_transit') {
      return res.status(400).json({
        success: false,
        message: 'Order not in transit'
      });
    }
    
    order.status = 'delivered';
    order.qrCodeScannedAt = new Date();
    order.actualDeliveryTime = new Date();
    order.statusHistory.push({
      status: 'delivered',
      updatedBy: req.user._id,
      notes: 'Buyer confirmed delivery'
    });
    await order.save();
    
    // Update driver status
    if (order.driver) {
      await User.findByIdAndUpdate(order.driver, {
        driverStatus: 'available'
      });
      
      const io = getIO();
      io.to(`driver_${order.driver}`).emit('delivery_confirmed', order);
    }
    
    await sendNotification(order.seller, {
      title: 'Delivery Confirmed',
      message: `Order ${order.orderId} has been delivered`,
      type: 'order_status_update',
      relatedOrder: order._id
    });
    
    res.json({
      success: true,
      message: 'Delivery confirmed',
      order
    });
  } catch (error) {
    next(error);
  }
};