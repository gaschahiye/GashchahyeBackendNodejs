const User = require('../models/User');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const Inventory = require('../models/Inventory');
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
        .populate('existingCylinder', 'serialNumber customName qrCode')
        .populate('deliveredCylinders', 'serialNumber customName weights') // Show Fresh Cylinders (List)
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

    console.log(`🔍 DEBUG: acceptOrder called for ${orderId}`);
    console.log('📦 Payload:', JSON.stringify(req.body, null, 2));

    const order = await Order.findById(orderId)
      .populate('buyer')
      .populate('seller')
      .populate('existingCylinder') // Needed for Refill Security Fee
      .populate('warehouse');       // Needed for Warehouse Location

    if (!order) {
      console.log('❌ DEBUG: Order not found');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log(`✅ DEBUG: Order found. Status: ${order.status}`);
    console.log(`   Warehouse: ${order.warehouse?._id}`);
    console.log(`   ExistingCylinder: ${order.existingCylinder?._id}`);

    if (order.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to accept this order' });
    }

    if (order.status !== 'assigned') {
      return res.status(400).json({ success: false, message: 'Order cannot be accepted in current status' });
    }

    if (!cylinders || !Array.isArray(cylinders) || cylinders.length === 0) {
      console.log('❌ DEBUG: No cylinder verification data provided');
      return res.status(400).json({ success: false, message: 'Please provide at least one cylinder verification' });
    }

    console.log(`🔄 DEBUG: Processing ${cylinders.length} cylinders...`);

    // Reset verification array
    order.cylinderVerification = [];

    // Determine Cylinder Location:
    // 1. Driver's Current Location (Best)
    // 2. Warehouse Location (Next Best - since at pickup)
    // 3. Fallback to default
    let cylinderLocation = {
      type: 'Point',
      coordinates: [0, 0]
    };

    if (req.user.currentLocation?.coordinates?.length === 2) {
      cylinderLocation.coordinates = req.user.currentLocation.coordinates;
    } else if (order.warehouse?.location?.coordinates?.length === 2) {
      cylinderLocation.coordinates = order.warehouse.location.coordinates;
    }

    console.log('📍 DEBUG: Determined Cylinder Location:', JSON.stringify(cylinderLocation));
    console.log('   User Location:', JSON.stringify(req.user.currentLocation));
    console.log('   Warehouse Location:', JSON.stringify(order.warehouse?.location));

    // Calculate security fee per cylinder
    let perCylinderSecurity = 0;
    if (order.orderType === 'refill') {
      // For Refills, inherit value from the returning cylinder
      perCylinderSecurity = order.existingCylinder?.securityFee || 0;
    } else {
      // For New Orders, use the charged price
      perCylinderSecurity = order.quantity > 0
        ? (order.pricing.securityCharges / order.quantity)
        : order.pricing.securityCharges;
    }

    console.log(`💰 DEBUG: Security Fee Per Cylinder: ${perCylinderSecurity}`);
    console.log(`   Order Type: ${order.orderType}`);
    console.log(`   Order Pricing Security: ${order.pricing.securityCharges}`);
    console.log(`   Existing Cylinder Security: ${order.existingCylinder?.securityFee}`);

    // Iterate over cylinders
    const createdCylinders = []; // Track ALL created/updated cylinders
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

      console.log(`   ➡ Processing Cylinder Serial: ${serialNumber}`);

      // Update or create Cylinder if it's a new order OR refill
      if (order.orderType === 'new' || order.orderType === 'refill') {
        const freshCylinder = await Cylinder.findOneAndUpdate(
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
            customName: `Cylinder ${order.cylinderSize}`, // Ensure name is set
            status: 'active', // Explicitly set status to active upon issuance
            currentLocation: cylinderLocation,
            warehouse: order.warehouse,
            qrCode: `${order._id}-${index + 1}`, // Generate unique QR for each cylinder
            lastUpdated: new Date()
          },
          { upsert: true, new: true }
        );

        createdCylinders.push(freshCylinder);
        console.log(`   ✅ Cylinder Saved: ${freshCylinder._id} (${freshCylinder.serialNumber})`);
      }
    }

    if (createdCylinders.length > 0) {
      order.deliveredCylinders = createdCylinders.map(c => c._id); // Link ALL Fresh Cylinders
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

    // Do NOT overwrite Cylinder QR code. 
    // Cylinder QR is permanent asset tag. Order QR is transaction specific.

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
      .populate('existingCylinder'); // Needed for Security Fee & Verification

    if (!order || order.driver.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    // --- PHASE 1: PICKUP AT SELLER (or Fresh Cylinder Scan) ---
    if (['pickup_ready', 'refill_accepted', 'assigned', 'qrgenerated'].includes(order.status)) {
      // Driver is scanning the FRESH cylinder at the seller's warehouse
      // We expect `qrCode` to remain on the cylinder (Permanent ID) OR Order QR if stickers used
      // But per new design, we assume they scan the ORDER QR to confirm pickup? 
      // OR do they scan the Cylinder Asset Tag?
      // Let's stick to Order QR validation for the transaction start

      if (order.qrCode !== qrCode) {
        // If they scanned a Cylinder Asset Tag, we might want to link it?
        // For now, strict Order QR check as per previous logic, OR verify if it matches assigned cylinder?
        // Let's assume strict Order QR for pickup confirmation.
        return res.status(400).json({ success: false, message: 'QR code does not match this order' });
      }

      order.status = 'in_transit';
      order.statusHistory.push({
        status: 'in_transit',
        updatedBy: req.user._id,
        notes: 'Driver scanned QR code and picked up fresh cylinder'
      });

      await order.save();
      await NotificationService.sendOrderNotification(order, 'order_status_update');
      return res.json({ success: true, message: 'Pickup confirmed. Order in transit.', order });
    }

    // --- PHASE 2: DELIVERY & SWAP AT BUYER ---
    else if (order.status === 'in_transit') {

      // Validate Delivery Scan
      if (order.qrCode !== qrCode) {
        return res.status(400).json({ success: false, message: 'QR code does not match this order' });
      }

      // 1. Check if a cylinder was already assigned to this order (e.g., during acceptOrder)
      let freshCylinder = await Cylinder.findOne({ order: order._id });

      if (freshCylinder) {
        // Existing Cylinder Found (Created in acceptOrder)
        freshCylinder.status = 'active';
        freshCylinder.currentLocation = order.deliveryLocation.location;
        freshCylinder.buyer = order.buyer._id; // Ensure ownership is final
        await freshCylinder.save();
      } else {
        // Fallback: Create new if none exists
        freshCylinder = new Cylinder({
          buyer: order.buyer._id,
          seller: order.seller,
          size: order.cylinderSize,
          status: 'active',
          currentLocation: order.deliveryLocation.location,
          serialNumber: `GEN-${Date.now()}`,
          qrCode: `CYL-${Date.now()}`,
          weights: { tareWeight: 10, netWeight: 10, grossWeight: 20, weightDifference: 0 },
          securityFee: order.existingCylinder?.securityFee || 0, // Copy from returned cylinder
          order: order._id
        });
        await freshCylinder.save();
      }

      // Update Order with the specific cylinder delivered (Add to Array)
      order.deliveredCylinders.addToSet(freshCylinder._id);

      // --- BRANCH BY ORDER TYPE ---
      if (order.orderType === 'refill') {
        // REFILL LOGIC: Must Collect Empty Cylinder
        if (!order.existingCylinder) {
          // This safeguards against data corruption
          return res.status(400).json({ success: false, message: 'Refill order missing existing cylinder data.' });
        }

        // Move OLD cylinder to Driver/Transit
        await Cylinder.findByIdAndUpdate(order.existingCylinder, {
          status: 'in_transit',
          buyer: null,
          currentLocation: req.user.currentLocation
        });

        order.status = 'empty_return'; // Status Change: 'delivered' -> 'empty_return' per User Request
        order.statusHistory.push({
          status: 'empty_return',
          updatedBy: req.user._id,
          notes: 'Refill Delivered. Fresh handed over, Empty waiting for return at seller.'
        });

      } else {
        // NEW ORDER / OTHER LOGIC: Just Delivery
        order.status = 'delivered'; // Should this go to completed? 
        // If it's a new order, there is no "Return Phase" at the seller?
        // Actually, driver goes back to seller anyway? But nothing to return.
        // Usually 'new' orders are "Done" at delivery?
        // Let's mark 'delivered'. If driver has nothing to return, maybe they can mark 'completed' manually?
        // Or let's auto-complete NEW orders since there is no phase 3.

        order.status = 'completed'; // New orders don't need to return an empty.
        order.statusHistory.push({
          status: 'completed', // Auto-complete for New Orders?
          updatedBy: req.user._id,
          notes: 'New Connection Delivered. Order Complete.'
        });

        // Free up driver immediately for New Orders
        await User.findByIdAndUpdate(req.user._id, { driverStatus: 'available' });
      }

      order.actualDeliveryTime = new Date();
      await order.save();
      await NotificationService.sendOrderNotification(order, 'delivery_confirmed');

      return res.json({ success: true, message: 'Delivery Confirmed', order });
    }

    // --- PHASE 3: RETURN DROP OFF AT SELLER (REFILLS ONLY) ---
    else if (['delivered', 'empty_return'].includes(order.status)) { // Accepts both for backward compatibility

      // Driver is at Seller's Warehouse with the Empty Cylinder (Cylinder B)
      // Must scan Cylinder B's QR Code to confirm return.

      if (!order.existingCylinder) {
        // If no existing cylinder, this step shouldn't happen? 
        // Or maybe it's just a completion check?
        // For refill, existingCylinder is mandatory.
        return res.status(400).json({ success: false, message: 'No cylinder to return for this order' });
      }

      const returnedCylinder = await Cylinder.findById(order.existingCylinder);
      if (!returnedCylinder) {
        return res.status(404).json({ success: false, message: 'Returned cylinder record not found' });
      }

      // VERIFY SCANNED QR (Allow QR Code OR Serial Number)
      // Expecting Scanned QR to be the Cylinder's Permanent Tag or Serial

      console.log(`qrCode: ${qrCode}`);
      console.log(`returnedCylinder.qrCode: ${returnedCylinder.qrCode}`);
      console.log(`returnedCylinder.serialNumber: ${returnedCylinder.serialNumber}`);
      if (returnedCylinder.qrCode !== qrCode) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect Cylinder! Scan the cylinder you picked up from Buyer.'
        });
      }

      // UPDATE SELLER INVENTORY (Add 1 Empty)
      // fetch inventory for this warehouse
      const inventory = await Inventory.findById(order.warehouse);
      if (inventory) {
        const size = returnedCylinder.size;
        // Check if size exists in inventory map, if so increment
        if (inventory.cylinders && inventory.cylinders[size]) {
          inventory.cylinders[size].quantity = (inventory.cylinders[size].quantity || 0) + 1;
          inventory.markModified('cylinders'); // Mixed type requires this
          await inventory.save();
        }
      }

      // DELETE CYLINDER RECORD (As per Seller requirement)
      await Cylinder.findByIdAndDelete(returnedCylinder._id);

      // UPDATE ORDER STATUS
      order.status = 'completed';
      order.statusHistory.push({
        status: 'completed',
        updatedBy: req.user._id,
        notes: 'Driver returned empty cylinder to seller. Cycle complete.'
      });

      await order.save();
      await User.findByIdAndUpdate(req.user._id, { driverStatus: 'available' });

      await NotificationService.sendOrderNotification(order, 'order_status_update'); // Notification to Seller

      return res.json({ success: true, message: 'Return Verified. Order Completed.', order });
    }

    else {
      res.status(400).json({ success: false, message: 'QR cannot be scanned in current status' });
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
      activeRefills,
      returnEmptyCylinders,
      todaysOrders
    ] = await Promise.all([
      Order.countDocuments({ driver: driverId, status: { $in: ['assigned', 'qrgenerated', 'accepted'] } }),
      Order.countDocuments({ driver: driverId, status: { $in: ['in_transit'] } }),
      Order.countDocuments({ driver: driverId, status: 'delivered' }),
      Order.countDocuments({ driver: driverId, orderType: 'return', status: { $in: ['return_requested', 'return_pickup'] } }),
      Order.countDocuments({ driver: driverId, orderType: 'refill', status: { $in: ['refill_requested', 'assigned', 'in_transit'] } }), // Renamed for clarity
      Order.countDocuments({ driver: driverId, status: 'empty_return' }), // NEW: User Requested "Return Empty Cylinder" section
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
        activeRefills, // Renamed from emptyCylinders
        returnEmptyCylinders // The new section
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