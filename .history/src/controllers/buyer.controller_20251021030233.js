const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const Inventory = require('../models/Inventory');
const Location = require('../models/Location');
const PaymentService = require('../services/payment.service');
const QRCodeService = require('../services/qrcode.service');
const NotificationService = require('../services/notification.service');

exports.addAddress = async (req, res, next) => {
  try {
    const { label, address, location, isDefault } = req.body;

    if (isDefault) {
      // Remove default from all other addresses
      await User.findByIdAndUpdate(req.user._id, {
        'addresses.$[].isDefault': false
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          addresses: {
            label,
            address,
            location: {
              type: 'Point',
              coordinates: location.coordinates
            },
            isDefault
          }
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Address added successfully',
      addresses: user.addresses
    });
  } catch (error) {
    next(error);
  }
};

exports.getNearbySellers = async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000, sortBy = 'distance' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInKm = parseFloat(radius) / 1000;

    // Find sellers with inventory in nearby locations
    const sellers = await User.aggregate([
      {
        $match: {
          role: 'seller',
          sellerStatus: 'approved',
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'locations',
          let: { sellerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$seller', '$$sellerId'] },
                isActive: true,
                location: {
                  $geoWithin: {
                    $centerSphere: [[longitude, latitude], radiusInKm / 6378.1]
                  }
                }
              }
            }
          ],
          as: 'locations'
        }
      },
      {
        $match: {
          'locations.0': { $exists: true }
        }
      },
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: 'seller',
          as: 'inventory'
        }
      },
      {
        $addFields: {
          distance: {
            $min: {
              $map: {
                input: '$locations',
                as: 'loc',
                in: {
                  $multiply: [
                    {
                      $acos: {
                        $add: [
                          {
                            $multiply: [
                              { $sin: { $degreesToRadians: latitude } },
                              { $sin: { $degreesToRadians: { $arrayElemAt: ['$$loc.location.coordinates', 1] } } }
                            ]
                          },
                          {
                            $multiply: [
                              { $cos: { $degreesToRadians: latitude } },
                              { $cos: { $degreesToRadians: { $arrayElemAt: ['$$loc.location.coordinates', 1] } } },
                              { $cos: {
                                $subtract: [
                                  { $degreesToRadians: { $arrayElemAt: ['$$loc.location.coordinates', 0] } },
                                  { $degreesToRadians: longitude }
                                ]
                              }}
                            ]
                          }
                        ]
                      }
                    },
                    6378.1
                  ]
                }
              }
            }
          }
        }
      }
    ]);

    // Sort sellers
    switch (sortBy) {
      case 'rating':
        sellers.sort((a, b) => b.rating.average - a.rating.average);
        break;
      case 'price_low':
        sellers.sort((a, b) => {
          const priceA = a.inventory[0]?.pricePerKg || Infinity;
          const priceB = b.inventory[0]?.pricePerKg || Infinity;
          return priceA - priceB;
        });
        break;
      case 'price_high':
        sellers.sort((a, b) => {
          const priceA = a.inventory[0]?.pricePerKg || 0;
          const priceB = b.inventory[0]?.pricePerKg || 0;
          return priceB - priceA;
        });
        break;
      default: // distance
        sellers.sort((a, b) => a.distance - b.distance);
    }

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

exports.createOrder = async (req, res, next) => {
  try {
    const {
      seller,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation,
      addOns = [],
      isUrgent = false,
      payment
    } = req.body;

    // Check seller inventory
    const inventory = await Inventory.findOne({ seller });
    if (!inventory || inventory.cylinders[cylinderSize].quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient inventory for ${cylinderSize} cylinders`
      });
    }

    // Calculate pricing
    const cylinderPrice = inventory.cylinders[cylinderSize].price * quantity;
    const addOnsTotal = addOns.reduce((total, addon) => total + (addon.price * addon.quantity), 0);
    
    // Calculate delivery charges (mock calculation based on distance)
    const deliveryCharges = isUrgent ? 200 : 100;
    const urgentDeliveryFee = isUrgent ? 100 : 0;

    const pricing = {
      cylinderPrice,
      securityCharges: 0, // Could be calculated based on cylinder size
      deliveryCharges,
      urgentDeliveryFee,
      addOnsTotal,
      subtotal: cylinderPrice + addOnsTotal,
      grandTotal: cylinderPrice + addOnsTotal + deliveryCharges + urgentDeliveryFee
    };

    // Create order
    const order = await Order.create({
      buyer: req.user._id,
      seller,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation,
      addOns,
      pricing,
      isUrgent,
      payment: {
        method: payment.method,
        status: 'pending'
      },
      status: 'pending'
    });

    // Process payment
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
        return res.status(400).json({
          success: false,
          message: 'Invalid payment method'
        });
    }

    if (!paymentResult.success) {
      // Delete order if payment fails
      await Order.findByIdAndDelete(order._id);
      
      return res.status(400).json({
        success: false,
        message: paymentResult.message
      });
    }

    // Update order with payment result
    order.payment.status = 'completed';
    order.payment.transactionId = paymentResult.transactionId;
    order.payment.paidAt = new Date();
    await order.save();

    // Update inventory
    inventory.cylinders[cylinderSize].quantity -= quantity;
    await inventory.save();

    // Send notifications
    await NotificationService.sendOrderNotification(order, 'order_created');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order,
      payment: paymentResult
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyCylinders = async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const query = { buyer: req.user._id };
    if (status) {
      query.status = status;
    }

    const cylinders = await Cylinder.find(query)
      .populate('seller', 'businessName phoneNumber')
      .populate('order', 'orderId status')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      cylinders
    });
  } catch (error) {
    next(error);
  }
};

exports.requestRefill = async (req, res, next) => {
  try {
    const { cylinderId, newSize } = req.body;

    const cylinder = await Cylinder.findById(cylinderId)
      .populate('seller')
      .populate('buyer');

    if (!cylinder || cylinder.buyer._id.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Cylinder not found'
      });
    }

    if (!['active', 'empty'].includes(cylinder.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cylinder not available for refill'
      });
    }

    // Create refill order
    const order = await Order.create({
      buyer: req.user._id,
      seller: cylinder.seller._id,
      orderType: 'refill',
      cylinderSize: newSize || cylinder.size,
      quantity: 1,
      existingCylinder: cylinderId,
      pickupLocation: cylinder.currentLocation,
      deliveryLocation: req.user.addresses.find(addr => addr.isDefault) || req.user.addresses[0],
      status: 'refill_requested',
      pricing: {
        cylinderPrice: 0, // Refill pricing would be calculated differently
        deliveryCharges: 80,
        subtotal: 0,
        grandTotal: 80
      },
      payment: {
        method: 'cod',
        status: 'pending'
      }
    });

    // Update cylinder status
    cylinder.status = 'in_refill';
    await cylinder.save();

    await NotificationService.sendOrderNotification(order, 'order_created');

    res.json({
      success: true,
      message: 'Refill request submitted successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

exports.scanQRCode = async (req, res, next) => {
  try {
    const { qrCode } = req.body;

    // Find order by QR code
    const order = await Order.findOne({ qrCode })
      .populate('buyer')
      .populate('driver')
      .populate('seller');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Invalid QR code'
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

    // Update order status
    if (order.status === 'in_transit') {
      order.status = 'delivered';
      order.qrCodeScannedAt = new Date();
      order.actualDeliveryTime = new Date();
      
      order.statusHistory.push({
        status: 'delivered',
        updatedBy: req.user._id,
        notes: 'Buyer confirmed delivery via QR scan'
      });

      await order.save();

      // Update driver status
      if (order.driver) {
        await User.findByIdAndUpdate(order.driver, {
          driverStatus: 'available'
        });
      }

      await NotificationService.sendOrderNotification(order, 'delivery_confirmed');

      res.json({
        success: true,
        message: 'Delivery confirmed successfully',
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

// Additional buyer controller methods would follow similar patterns...