const User = require('../models/User');
const Order = require('../models/Order');
const GoogleSheetService = require('../services/googleSheet.service');
const Cylinder = require('../models/Cylinder');
const Rating = require('../models/Rating');
const Inventory = require('../models/Inventory');
const Location = require('../models/Location');
const PaymentService = require('../services/payment.service');
const QRCodeService = require('../services/qrcode.service');
const NotificationService = require('../services/notification.service');
const { startSession } = require("mongoose");
const { notifyNewOrder } = require('../config/socket');
const mongoose = require("mongoose");

const addAddress = async (req, res, next) => {
  try {
    const { label, address, location, isDefault } = req.body;

    // Replace the old addresses array with a single address
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        addresses: [
          {
            label,
            address,
            location: { type: 'Point', coordinates: location.coordinates },
            isDefault
          }
        ]
      },
      { new: true } // return updated document
    );

    res.json({
      success: true,
      message: 'Address saved successfully',
      addresses: user.addresses
    });
  } catch (error) {
    next(error);
  }
};


const getNearbySellers = async (req, res, next) => {
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

    // STEP 1: Fetch sellers, their active warehouse locations & inventories
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
      { $match: { 'locations.0': { $exists: true } } },
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: 'seller',
          as: 'inventories'
        }
      }
    ]);

    // STEP 2: FLATTEN OUTPUT (Only include locations WITH inventory)
    const formattedList = [];

    sellers.forEach(seller => {
      seller.locations.forEach(location => {
        const inventory = seller.inventories.find(
          inv => inv.locationid?.toString() === location._id.toString()
        );

        // ✅ Skip if no inventory
        if (!inventory) return;

        formattedList.push({
          // Seller Info
          sellerId: seller._id,
          sellerName: seller.businessName,
          rating: seller.rating?.average || 0,

          // Location Info
          locationId: location._id,
          locationName: location.name,
          city: location.city,
          address: location.address,
          coordinates: location.location?.coordinates || [],

          // Inventory Info
          inventoryId: inventory._id,
          pricePerKg: inventory.pricePerKg,
          cylinders: inventory.cylinders,
          addOns: inventory.addOns,
          lastUpdated: inventory.updatedAt
        });
      });
    });

    // STEP 3: SORTING
    if (sortBy === 'rating') {
      formattedList.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'price_low') {
      formattedList.sort(
        (a, b) => (a.pricePerKg || Infinity) - (b.pricePerKg || Infinity)
      );
    } else if (sortBy === 'price_high') {
      formattedList.sort(
        (a, b) => (b.pricePerKg || 0) - (a.pricePerKg || 0)
      );
    }

    // STEP 4: RESPONSE
    res.json({
      success: true,
      count: formattedList.length,
      items: formattedList
    });

  } catch (error) {
    next(error);
  }
};




const createOrder = async (req, res, next) => {
  const session = await startSession();

  try {
    session.startTransaction();

    const {
      seller,
      locationid,
      orderType,
      cylinderSize,
      quantity,
      deliveryLocation,
      addOns = [],
      isUrgent = false,
      payment
    } = req.body;

    // Basic validation
    if (!seller || !locationid || !orderType || !cylinderSize || !quantity || !deliveryLocation || !deliveryLocation.location) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Fetch inventory for specific warehouse (with session)
    const inventory = await Inventory.findOne({
      seller,
      locationid
    }).session(session);

    if (!inventory) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Inventory for this warehouse not found'
      });
    }

    // Access cylinder by key
    const cylinder = inventory.cylinders && inventory.cylinders[cylinderSize];
    if (!cylinder || (cylinder.quantity || 0) < quantity) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Not enough ${cylinderSize} cylinders available`
      });
    }

    const cylinderData = inventory.cylinders[cylinderSize];
    const weight = parseFloat(cylinderSize);
    const pricePerKg = inventory.pricePerKg;

    // Calculate pricing
    const securityCharges = cylinderData.price || 0;
    const gasPrice = weight * pricePerKg;
    const addOnsTotal = (addOns || []).reduce(
      (sum, a) => sum + ((a.price || 0) * (a.quantity || 0)),
      0
    );
    const deliveryCharges = isUrgent ? 200 : 100;
    const urgentDeliveryFee = isUrgent ? 100 : 0;
    const subtotal = (gasPrice * quantity) + addOnsTotal;
    const grandTotal = subtotal + securityCharges + deliveryCharges + urgentDeliveryFee;

    const pricing = {
      gasPrice,
      cylinderPrice: gasPrice,
      securityCharges,
      deliveryCharges,
      urgentDeliveryFee,
      addOnsTotal,
      subtotal,
      grandTotal
    };

    // Generate order ID
    const orderId = generateOrderId();

    // Create order
    const orderDoc = new Order({
      buyer: req.user._id,
      seller,
      orderId,
      warehouse: inventory._id,
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
      paymentTimeline: [
        // 1. Gas Sale (Subtotal: Gas + Addons)
        {
          timelineId: new mongoose.Types.ObjectId().toString(),
          type: 'sale',
          cause: 'Gas & Addons',
          amount: pricing.subtotal,
          liabilityType: 'revenue',
          paymentMethod: payment.method,
          status: 'pending',
          createdAt: new Date()
        },
        // 2. Security Charges (if any)
        ...(pricing.securityCharges > 0 ? [{
          timelineId: new mongoose.Types.ObjectId().toString(),
          type: 'sale',
          cause: 'Security Deposits',
          amount: pricing.securityCharges,
          liabilityType: 'refundable',
          paymentMethod: payment.method,
          status: 'pending',
          createdAt: new Date()
        }] : [])
        // Removed Delivery Fee from timeline as per user request
      ],
      status: 'pending',
      statusHistory: [{
        status: 'pending',
        updatedBy: req.user._id
      }]
    });

    await orderDoc.save({ session });

    // Update inventory
    inventory.cylinders[cylinderSize].quantity =
      (inventory.cylinders[cylinderSize].quantity || 0) - quantity;
    inventory.issuedCylinders = (inventory.issuedCylinders || 0) + quantity;
    await inventory.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate response
    const responseOrder = await Order.findById(orderDoc._id)
      .populate({
        path: 'warehouse',
        select: 'location city'
      })
      .populate('buyer', 'name phoneNumber')
      .populate('seller', 'businessName phoneNumber');

    // ✅ Centralized Notification (Admin, Seller, Buyer)
    await NotificationService.sendOrderNotification(responseOrder, 'order_created');

    // ✅ Note: notifyNewOrder still handles the specific admin layout logic in config/socket.js
    notifyNewOrder({
      _id: orderDoc._id,
      orderId: orderId,
      orderNumber: orderId,
      buyer: req.user._id,
      seller: seller,
      totalAmount: grandTotal,
      buyerName: req.user.name || req.user.phoneNumber,
      sellerName: responseOrder.seller?.businessName || 'Seller',
      cylinderSize: cylinderSize,
      quantity: quantity,
      status: 'pending',
      createdAt: new Date()
    });

    // ✅ Consolidated Sheet Sync
    syncOrderTimelineToSheet(responseOrder, responseOrder.seller, responseOrder.buyer);

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: responseOrder
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
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
      .populate({
        path: 'seller',
        select: 'rating businessName phoneNumber -locations'
      })
      .populate('order', 'orderId status payment',)
      .populate('warehouse',)
      .sort({ createdAt: -1 }).lean();
    cylinders.forEach(c => {
      if (c.seller) delete c.seller.locations;
    });

    res.json({ success: true, cylinders });
  } catch (error) {
    next(error);
  }
};

const requestRefill = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { cylinderId, newSize } = req.body;

      // Find cylinder
      const cylinder = await Cylinder.findById(cylinderId)
        .populate('seller')
        .populate('buyer')
        .session(session);

      if (!cylinder || cylinder.buyer._id.toString() !== req.user._id.toString()) {
        throw new Error('Cylinder not found');
      }
      if (!['active', 'empty'].includes(cylinder.status)) {
        throw new Error('Cylinder not available for refill');
      }

      // Find original order (to get location and payment prefs)
      const originalOrder = await Order.findById(cylinder.order).session(session);
      if (!originalOrder) throw new Error('Original order not found');

      // Find seller inventory
      const inventory = await Inventory.findOne({ seller: cylinder.seller._id }).session(session);
      if (!inventory) throw new Error('Seller inventory not found');

      // Calculate pricing
      const sizeStr = newSize || cylinder.size;
      const kg = parseFloat(sizeStr.replace('kg', ''));
      const cylinderPrice = inventory.cylinders[sizeStr]?.price || 0;
      const computedCylinderPrice = cylinderPrice > 0 ? cylinderPrice : (kg * inventory.pricePerKg);

      // Delivery charges
      const isUrgent = originalOrder.isUrgent || false; // Inherit preference? Or default false?
      // Better to check if user passed isUrgent in body, but body only has cylinderId/newSize. Use default false or inherit.
      // Let's assume default delivery behavior (standard) unless specified, but previous code used order.isUrgent. 
      // Safe to default to normal delivery (100) or check if we want to inherit. 
      // Let's use standard delivery for refills unless we add isUrgent to API.
      const deliveryCharges = 100;
      const urgentDeliveryFee = 0;

      const subtotal = computedCylinderPrice;
      const grandTotal = subtotal + deliveryCharges;

      // Generate NEW Order ID
      const newOrderId = generateOrderId();

      // Create NEW Order
      const newOrder = new Order({
        orderId: newOrderId,
        buyer: req.user._id,
        seller: cylinder.seller._id,
        warehouse: originalOrder.warehouse, // Assuming same warehouse
        driver: null, // Reset driver, will find new one
        orderType: 'refill',
        cylinderSize: sizeStr,
        quantity: 1, // Refills are usually 1 cylinder
        existingCylinder: cylinder._id,
        pickupLocation: originalOrder.pickupLocation, // Copy if exists
        deliveryLocation: originalOrder.deliveryLocation, // Copy location
        pricing: {
          cylinderPrice: computedCylinderPrice,
          securityCharges: 0,
          deliveryCharges,
          urgentDeliveryFee,
          addOnsTotal: 0,
          subtotal,
          grandTotal
        },
        payment: {
          method: originalOrder.payment?.method || 'cod',
          status: 'pending'
        },
        status: 'refill_requested',
        statusHistory: [{
          status: 'refill_requested',
          updatedBy: req.user._id,
          timestamp: new Date()
        }],
        paymentTimeline: [
          {
            timelineId: new mongoose.Types.ObjectId().toString(),
            type: 'sale',
            cause: 'Cylinder Refill Sale',
            amount: computedCylinderPrice,
            liabilityType: 'revenue',
            paymentMethod: originalOrder.payment?.method || 'cod',
            status: 'pending',
            driverId: null,
            createdAt: new Date()
          }
        ],
        driverEarnings: []
      });

      // Find driver in zone (using new order's location)
      const driver = await findDriverInZone(newOrder.deliveryLocation.location);

      if (driver) {
        newOrder.driver = driver._id;
        newOrder.status = 'refill_pickup';
        newOrder.statusHistory.push({
          status: 'refill_pickup',
          updatedBy: driver._id
        });

        // Add driver earnings
        newOrder.driverEarnings.push({
          driver: driver._id,
          amount: deliveryCharges,
          status: 'pending',
          createdAt: new Date()
        });

        await User.updateOne(
          { _id: driver._id },
          { $set: { driverStatus: 'busy' } },
          { session }
        );
      }

      await newOrder.save({ session });

      console.log('🌊 DEBUG: Refill requested. New Order:', newOrderId, 'Driver:', driver?._id);

      // Notify driver (if assigned) and seller
      // Note: newOrder is passed, so notification will link to new order details
      await NotificationService.sendOrderNotification(newOrder, driver ? 'refill_pickup' : 'refill_requested');

      // Sync Sheet
      syncOrderTimelineToSheet(newOrder, cylinder.seller, cylinder.buyer);

      // Update cylinder status AND link to NEW order
      cylinder.status = 'in_refill';
      cylinder.order = newOrder._id; // <--- Critical: Point to new order
      cylinder.assignedOrder = newOrder._id; // Deprecated field? Or alias? Keeping both synced.
      await cylinder.save({ session });

      // Prepare response
      const populated = await Order.findById(newOrder._id)
        .populate({ path: 'driver', select: '_id fullName phoneNumber driverStatus' })
        .populate({ path: 'warehouse', select: 'location city' })
        .session(session);

      return res.status(200).json({
        success: true,
        message: driver
          ? 'Refill requested – driver assigned for pickup'
          : 'Refill requested – pickup created (no driver)',
        order: populated
      });
    });
  } catch (err) {
    await session.endSession();
    console.error(err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
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



// Update cylinder custom name (buyer only)
const updateCylinderName = async (req, res, next) => {
  try {
    const cylinderId = req.params.id;               // from URL: PUT /api/buyer/cylinders/:id/name
    const { customName } = req.body;

    if (!customName || typeof customName !== 'string' || customName.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'customName is required' });
    }

    // find cylinder
    const cylinder = await Cylinder.findById(cylinderId).session ? await Cylinder.findById(cylinderId).session() : await Cylinder.findById(cylinderId);
    if (!cylinder) {
      return res.status(404).json({ success: false, message: 'Cylinder not found' });
    }

    // Ownership check: buyer must own the cylinder
    // if cylinder.buyer is null or different -> forbid
    if (!cylinder.buyer || cylinder.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this cylinder' });
    }

    // Update and save
    cylinder.customName = customName.trim();
    await cylinder.save();

    // Optionally remove heavy fields or populate minimal seller if you want
    // const result = await Cylinder.findById(cylinder._id).populate({ path: 'seller', select: 'businessName phoneNumber' }).lean();

    return res.status(200).json({ success: true, message: 'Cylinder name updated', cylinder });
  } catch (error) {
    next(error);
  }
};
const getOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { buyer: req.user._id };

    // --------------------------------------------------
    // NEW FILTER LOGIC
    // --------------------------------------------------
    if (status) {
      if (status === 'pending') {
        // buyer has just requested – seller hasn’t acted yet
        query.status = { $in: ['pending', 'refill_requested', 'return_requested'] };
      } else if (status === 'inprocess') {
        // everything that is neither “new” nor finished
        query.status = {
          $nin: ['pending', 'refill_requested', 'return_requested', 'completed', 'cancelled']
        };
      } else {
        // exact match for any other status string
        query.status = status;
      }
    }
    // --------------------------------------------------

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('buyer', 'fullName phoneNumber addresses')
        .populate('driver', 'fullName vehicleNumber phoneNumber')
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

// in buyer.controller.js (same file)
const requestReturnAndRate = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const { cylinderId, stars, description, type } = req.body;

      if (!cylinderId || !stars || !type) {
        throw new Error("cylinderId, stars and type are required");
      }

      // Find Cylinder
      const cylinder = await Cylinder.findById(cylinderId)
        .populate("seller")
        .populate("buyer")
        .populate("order") // This will be the current active order
        .session(session);

      if (!cylinder || cylinder.buyer._id.toString() !== req.user._id.toString()) {
        throw new Error("Cylinder not found or not yours");
      }

      const originalOrder = cylinder.order;
      if (!originalOrder) throw new Error("Order not found");

      // Calculate refund amount (security fee)
      // If original order had security charges, we refund them (or a policy defined amount).
      // Assuming full refund of original security charges or default from cylinder property.
      const securityFee = cylinder.securityFee || originalOrder.pricing.securityCharges || 0;
      const pickupFee = 100; // Standard pickup logic (was based on isUrgent, defaulting to standard 100)

      // Generate NEW Order ID
      const newOrderId = generateOrderId();

      // Create NEW Order for Return
      const newOrder = new Order({
        orderId: newOrderId,
        buyer: req.user._id,
        seller: cylinder.seller._id,
        warehouse: originalOrder.warehouse,
        driver: null,
        orderType: 'return',
        cylinderSize: cylinder.size,
        quantity: 1,
        existingCylinder: cylinder._id,
        pickupLocation: originalOrder.pickupLocation,
        deliveryLocation: originalOrder.deliveryLocation,
        pricing: {
          cylinderPrice: 0,
          securityCharges: 0, // No new charge
          deliveryCharges: pickupFee,
          urgentDeliveryFee: 0,
          addOnsTotal: 0,
          subtotal: 0,
          grandTotal: pickupFee // Only pay for pickup? Or deducted from refund?
          // Usually refund = Security - PickupFee.
          // But here strict schema: GrandTotal is usually what buyer PAYS.
          // If buyer receives money, tracking is in paymentTimeline.
          // Let's keep GrandTotal as the service cost (pickup fee).
        },
        payment: {
          method: originalOrder.payment?.method || 'cod',
          status: 'pending'
        },
        status: 'return_requested',
        statusHistory: [{
          status: 'return_requested',
          updatedBy: req.user._id,
          timestamp: new Date()
        }],
        paymentTimeline: [
          {
            timelineId: new mongoose.Types.ObjectId().toString(),
            type: 'refund',
            amount: securityFee,
            liabilityType: 'liability',
            status: 'pending',
            driverId: null,
            createdAt: new Date()
          }
        ],
        driverEarnings: []
      });

      // Find driver in zone
      const driver = await findDriverInZone(newOrder.deliveryLocation.location);

      if (driver) {
        newOrder.driver = driver._id;
        newOrder.status = 'return_pickup';
        newOrder.statusHistory.push({
          status: 'return_pickup',
          updatedBy: driver._id,
        });

        // Add driver earnings for pickup
        newOrder.driverEarnings.push({
          driver: driver._id,
          amount: pickupFee,
          status: 'pending',
          createdAt: new Date()
        });

        await User.updateOne(
          { _id: driver._id },
          { $set: { driverStatus: 'busy' } },
          { session }
        );
      }

      await newOrder.save({ session });

      // Sync Sheet (for the NEW order)
      syncOrderTimelineToSheet(newOrder, cylinder.seller, cylinder.buyer);

      // Update Cylinder
      cylinder.status = "returned";
      cylinder.order = newOrder._id; // <--- Point to NEW order
      cylinder.assignedOrder = newOrder._id;
      await cylinder.save({ session });

      // Create Rating (Linked to ORIGINAL order, as the service/product is being rated)
      const existingRating = await Rating.findOne({
        order: originalOrder._id,
        buyer: req.user._id,
      }).session(session);

      if (existingRating) {
        // Warning: user might have already rated. 
        // If strict, throw error: throw new Error("You have already rated this order");
        // But since we are creating a new return request, maybe we ignore rating if already exists?
        // Or we update it? 
        // Logic says "Request Return AND Rate".
        // If already rated, we just skip rating creation or fail?
        // The previous code threw error. Sticking to that behavior.
        throw new Error("You have already rated this order");
      } else {
        await Rating.create([{
          order: originalOrder._id,
          buyer: req.user._id,
          seller: originalOrder.seller,
          stars,
          description,
          type,
        }], { session });
      }

      // Populate response
      const populated = await Order.findById(newOrder._id)
        .populate({ path: "driver", select: "fullName phoneNumber driverStatus" })
        .populate({ path: "warehouse", select: "location city" })
        .session(session);

      // Notify driver (if assigned) and seller
      await NotificationService.sendOrderNotification(newOrder, driver ? 'return_pickup' : 'return_requested');

      return res.status(200).json({
        success: true,
        message: driver
          ? "Return requested & rating submitted – driver assigned"
          : "Return requested & rating submitted – waiting for driver",
        order: populated,
      });
    });

  } catch (error) {
    await session.endSession();
    console.error(error);
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

const findDriverInZone = async (location) => {
  try {
    const drivers = await User.find({
      role: 'driver',
      driverStatus: 'available',
      autoAssignOrders: true,
      zone: {
        $exists: true,
        $ne: null
      }
    });

    // Find driver whose zone contains the location
    for (const driver of drivers) {
      if (driver.zone && driver.zone.coordinates) {
        const point = {
          type: 'Point',
          coordinates: [location.coordinates[0], location.coordinates[1]]
        };

        // Simple polygon containment check (for demonstration)
        // In production, use proper geospatial queries with MongoDB
        const polygon = driver.zone.coordinates[0];
        if (isPointInPolygon(point.coordinates, polygon)) {
          return driver;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding driver in zone:', error);
    return null;
  }
};

// Helper function for point-in-polygon check
const isPointInPolygon = (point, polygon) => {
  const x = point[0], y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
};


/**
 * Internal helper to sync order timeline entries to Google Sheet
 * Handles person resolution and filtering 1:1 with Admin Ledger logic
 */
async function syncOrderTimelineToSheet(order, sellerInfo, buyerInfo) {
  try {
    const GoogleSheetService = require('../services/googleSheet.service');

    for (const entry of order.paymentTimeline) {
      // ✅ FILTERING RULES (Same as _rebuildSheetLogic)
      const isReturn = order.orderType === 'return';
      const isSecurityDeposit = entry.cause === 'Security Deposits';
      const isDeliveryFee = entry.type === 'delivery_fee';

      let shouldPush = false;
      if (!isSecurityDeposit && !isDeliveryFee) {
        shouldPush = true;
      } else if (isReturn && (isSecurityDeposit || isDeliveryFee)) {
        shouldPush = true;
      }

      if (!shouldPush) continue;

      // ✅ PERSON RESOLUTION
      let personName = 'N/A';
      let personType = 'other';
      let personPhone = 'N/A';

      if (entry.type === 'delivery_fee') {
        // If driver is already assigned/present in the entry or order
        if (order.driver && typeof order.driver === 'object') {
          personName = order.driver.fullName || 'Driver';
          personType = 'driver';
          personPhone = order.driver.phoneNumber || '';
        }
      } else if (['sale', 'seller_payment'].includes(entry.type)) {
        // Resolve Seller Name (Handle object or ID)
        const seller = typeof sellerInfo === 'object' ? sellerInfo : order.seller;
        personName = seller?.businessName || seller?.fullName || 'Seller';
        personType = 'seller';
        personPhone = seller?.phoneNumber || '';
      } else if (['refund', 'partial_refund', 'return'].includes(entry.type)) {
        // Resolve Buyer Name (Handle object or ID)
        const buyer = typeof buyerInfo === 'object' ? buyerInfo : order.buyer;
        personName = buyer?.fullName || buyer?.name || 'Buyer';
        personType = 'buyer';
        personPhone = buyer?.phoneNumber || '';
      }

      await GoogleSheetService.addPaymentRow({
        date: entry.createdAt.toISOString().replace('T', ' ').slice(0, 16),
        orderId: order.orderId,
        personName,
        personType,
        personPhone,
        type: entry.type,
        liabilityType: entry.liabilityType,
        details: entry.cause,
        amount: entry.amount,
        status: entry.status,
        timelineId: entry.timelineId
      });
    }
  } catch (err) {
    console.error('[SheetSync Helper] Error:', err.message);
  }
}

module.exports = {
  addAddress,
  getNearbySellers,
  createOrder,
  generateOrderId,
  getMyCylinders,
  requestRefill,
  scanQRCode,
  updateCylinderName,
  getOrders,
  requestReturnAndRate,
  syncOrderTimelineToSheet
};
