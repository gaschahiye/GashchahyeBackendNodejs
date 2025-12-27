const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const Inventory = require('../models/Inventory');
const Location = require('../models/Location');
const PaymentService = require('../services/payment.service');
const QRCodeService = require('../services/qrcode.service');
const NotificationService = require('../services/notification.service');

const addAddress = async (req, res, next) => {
  try {
    const { label, address, location, isDefault } = req.body;

    if (isDefault) {
      await User.findByIdAndUpdate(req.user._id, { 'addresses.$[].isDefault': false });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          addresses: {
            label,
            address,
            location: { type: 'Point', coordinates: location.coordinates },
            isDefault
          }
        }
      },
      { new: true }
    );

    res.json({ success: true, message: 'Address added successfully', addresses: user.addresses });
  } catch (error) {
    next(error);
  }
};

const getNearbySellers = async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000, sortBy = 'distance' } = req.query;

    if (!lat || !lng)
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInKm = parseFloat(radius) / 1000;

    const sellers = await User.aggregate([
      { $match: { role: 'seller', sellerStatus: 'approved', isActive: true } },
      {
        $lookup: {
          from: 'locations',
          let: { sellerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$seller', '$$sellerId'] },
                isActive: true,
                location: { $geoWithin: { $centerSphere: [[longitude, latitude], radiusInKm / 6378.1] } }
              }
            }
          ],
          as: 'locations'
        }
      },
      { $match: { 'locations.0': { $exists: true } } },
      { $lookup: { from: 'inventories', localField: '_id', foreignField: 'seller', as: 'inventory' } }
    ]);

    sellers.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return b.rating.average - a.rating.average;
        case 'price_low':
          return (a.inventory[0]?.pricePerKg || Infinity) - (b.inventory[0]?.pricePerKg || Infinity);
        case 'price_high':
          return (b.inventory[0]?.pricePerKg || 0) - (a.inventory[0]?.pricePerKg || 0);
        default:
          return a.distance - b.distance;
      }
    });

    res.json({
      success: true,
      sellers: sellers.map(seller => ({
        _id: seller._id,
        businessName: seller.businessName,
        rating: seller.rating,
        distance: seller.distance,
        locations: seller.locations,
        inventory: seller.inventory[0]
      }))
    });
  } catch (error) {
    next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const { seller, orderType, cylinderSize, quantity, deliveryLocation, addOns = [], isUrgent = false, payment } = req.body;

    // ✅ Fetch inventory
    const inventory = await Inventory.findOne({ seller });
    if (!inventory) {
      return res.status(400).json({ success: false, message: 'Seller inventory not found' });
    }

    // ✅ Check cylinder size exists
    const cylinder = inventory.cylinders[cylinderSize];
    if (!cylinder) {
      return res.status(400).json({ success: false, message: `Cylinder size ${cylinderSize} not available in inventory` });
    }

    // ✅ Check quantity
    if (cylinder.quantity < quantity) {
      return res.status(400).json({ success: false, message: `Insufficient inventory for ${cylinderSize}` });
    }

    // Pricing
    const cylinderPrice = cylinder.price * quantity;
    const addOnsTotal = addOns.reduce((sum, a) => sum + (a.price * a.quantity || 0), 0);
    const deliveryCharges = isUrgent ? 200 : 100;
    const urgentDeliveryFee = isUrgent ? 100 : 0;
    const pricing = {
      cylinderPrice,
      securityCharges: 0,
      deliveryCharges,
      urgentDeliveryFee,
      addOnsTotal,
      subtotal: cylinderPrice + addOnsTotal,
      grandTotal: cylinderPrice + addOnsTotal + deliveryCharges + urgentDeliveryFee
    };

    // Create order
    const order = await Order.create({
      buyer: req.user._id,
      orderId: generateOrderId(),
      seller,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation,
      addOns,
      pricing,
      isUrgent,
      payment: { method: payment.method, status: 'pending' },
      status: 'pending'
    });

    // Payment processing
    let paymentResult;
    switch (payment.method) {
      case 'jazzcash':
        paymentResult = await PaymentService.processJazzCashPayment(order);
        break;
      case 'easypaisa':
        paymentResult = await PaymentService.processEasyPaisaPayment(order);
        break;
      case 'cod':
        paymentResult = await PaymentService.processCODPayment(order);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    if (!paymentResult.success) {
      await Order.findByIdAndDelete(order._id);
      return res.status(400).json({ success: false, message: paymentResult.message });
    }

    // Update order payment status
    order.payment = { ...order.payment, status: 'completed', transactionId: paymentResult.transactionId, paidAt: new Date() };
    await order.save();

    // Update inventory
    cylinder.quantity -= quantity;
    await inventory.save();

    // Send notification
    await NotificationService.sendOrderNotification(order, 'order_created');

    res.status(201).json({ success: true, message: 'Order created successfully', order, payment: paymentResult });

  } catch (error) {
    next(error);
  }
};

function generateOrderId() {
  // Generate a random number between 0 and 99999
  const randomNum = Math.floor(Math.random() * 100000);

  // Pad with leading zeros if necessary (to always get 5 digits)
  const orderId = randomNum.toString().padStart(5, '0');

  return orderId;
}

const getMyCylinders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { buyer: req.user._id, ...(status && { status }) };
    const cylinders = await Cylinder.find(query)
      .populate('seller', 'businessName phoneNumber')
      .populate('order', 'orderId status')
      .sort({ createdAt: -1 });

    res.json({ success: true, cylinders });
  } catch (error) {
    next(error);
  }
};

const requestRefill = async (req, res, next) => {
  try {
    const { cylinderId, newSize } = req.body;
    const cylinder = await Cylinder.findById(cylinderId).populate('seller').populate('buyer');

    if (!cylinder || cylinder.buyer._id.toString() !== req.user._id.toString())
      return res.status(404).json({ success: false, message: 'Cylinder not found' });

    if (!['active', 'empty'].includes(cylinder.status))
      return res.status(400).json({ success: false, message: 'Cylinder not available for refill' });

    const order = await Order.create({
      buyer: req.user._id,
      seller: cylinder.seller._id,
      orderType: 'refill',
      cylinderSize: newSize || cylinder.size,
      quantity: 1,
      existingCylinder: cylinderId,
      pickupLocation: cylinder.currentLocation,
      deliveryLocation: req.user.addresses.find(a => a.isDefault) || req.user.addresses[0],
      status: 'refill_requested',
      pricing: { cylinderPrice: 0, deliveryCharges: 80, subtotal: 0, grandTotal: 80 },
      payment: { method: 'cod', status: 'pending' }
    });

    cylinder.status = 'in_refill';
    await cylinder.save();

    await NotificationService.sendOrderNotification(order, 'order_created');

    res.json({ success: true, message: 'Refill request submitted successfully', order });
  } catch (error) {
    next(error);
  }
};

const scanQRCode = async (req, res, next) => {
  try {
    const { qrCode } = req.body;
    const order = await Order.findOne({ qrCode }).populate('buyer').populate('driver').populate('seller');

    if (!order) return res.status(404).json({ success: false, message: 'Invalid QR code' });

    const verification = await QRCodeService.verifyQRCode(qrCode, { orderId: order.orderId });
    if (!verification.isValid)
      return res.status(400).json({ success: false, message: verification.reason });

    if (order.status === 'in_transit') {
      order.status = 'delivered';
      order.qrCodeScannedAt = new Date();
      order.actualDeliveryTime = new Date();
      order.statusHistory.push({ status: 'delivered', updatedBy: req.user._id, notes: 'Buyer confirmed via QR' });
      await order.save();

      if (order.driver) await User.findByIdAndUpdate(order.driver, { driverStatus: 'available' });
      await NotificationService.sendOrderNotification(order, 'delivery_confirmed');

      res.json({ success: true, message: 'Delivery confirmed successfully', order });
    } else {
      res.status(400).json({ success: false, message: 'QR cannot be scanned in current status' });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addAddress,
  getNearbySellers,
  createOrder,
  getMyCylinders,
  requestRefill,
  scanQRCode
};