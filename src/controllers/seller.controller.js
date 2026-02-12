// src/controllers/seller.controller.js
const mongoose = require('mongoose'); // <-- move this to the top
const User = require('../models/User');
const Location = require('../models/Location');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const InvoiceService = require('../services/invoice.service');
const NotificationService = require('../services/notification.service');
const { startSession } = require("mongoose");
const { notifyOrderStatusChange } = require('../config/socket');





// ==================== LOCATION CONTROLLERS ====================

const addLocation = async (req, res, next) => {
  try {
    const { locations } = req.body;

    // Seller must be approved
    if (req.user.sellerStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account is not approved yet'
      });
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one location.'
      });
    }

    const formattedLocations = locations.map((loc) => {
      const coords = loc.location.coordinates;
      // MongoDB requires [Longitude, Latitude]. 
      // If the first coordinate is < 50 (typical Latitude for this region) 
      // and the second is > 60 (typical Longitude), we swap them to be safe.
      const lng = coords[0] < 50 && coords[1] > 60 ? coords[1] : coords[0];
      const lat = coords[0] < 50 && coords[1] > 60 ? coords[0] : coords[1];

      return {
        seller: req.user._id,
        warehouseName: loc.warehouseName,
        city: loc.city,
        address: loc.address,
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        }
      };
    });

    const newLocations = await Location.insertMany(formattedLocations);

    res.status(201).json({
      success: true,
      message: 'Locations added successfully',
      locations: newLocations
    });
  } catch (error) {
    next(error);
  }
};

const getMyLocations = async (req, res, next) => {
  try {
    const locations = await Location.find({ seller: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, locations });
  } catch (error) {
    next(error);
  }
};

const updateLocation = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const updates = req.body;

    const location = await Location.findOne({
      _id: locationId,
      seller: req.user._id
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    if (updates.warehouseName) location.warehouseName = updates.warehouseName;
    if (updates.city) location.city = updates.city;
    if (updates.address) location.address = updates.address;
    if (updates.location && updates.location.coordinates) {
      const coords = updates.location.coordinates;
      const lng = coords[0] < 50 && coords[1] > 60 ? coords[1] : coords[0];
      const lat = coords[0] < 50 && coords[1] > 60 ? coords[0] : coords[1];
      location.location.coordinates = [lng, lat];
    }
    if (typeof updates.isActive === 'boolean') location.isActive = updates.isActive;

    await location.save();

    res.json({
      success: true,
      message: 'Location updated successfully',
      location
    });
  } catch (error) {
    next(error);
  }
};

// ==================== INVENTORY CONTROLLERS ====================

const addUpdateInventory = async (req, res, next) => {
  try {
    console.log("BODY:", req.body);
    const { locationid, location, city, pricePerKg, cylinders, addOns = [] } = req.body;

    // Validate location
    const locationDoc = await Location.findOne({
      _id: locationid,
      seller: req.user._id
    });

    if (!locationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Location not found or unauthorized'
      });
    }

    const locationObjectId = new mongoose.Types.ObjectId(locationid);

    // Check if inventory exists for this seller & location
    let inventory = await Inventory.findOne({
      seller: req.user._id,
      locationid: locationObjectId
    });

    if (inventory) {
      // Update only the fields sent
      const oldPricePerKg = inventory.pricePerKg;
      const newPricePerKg = pricePerKg ?? inventory.pricePerKg;

      inventory.pricePerKg = newPricePerKg;
      inventory.city = city ?? inventory.city;

      // ✅ Update cylinders - works with Mixed type
      Object.keys(cylinders).forEach(size => {
        if (!inventory.cylinders[size]) {
          inventory.cylinders[size] = {};
        }
        if (cylinders[size].quantity !== undefined) {
          inventory.cylinders[size].quantity = cylinders[size].quantity;
        }
        if (cylinders[size].price !== undefined) {
          inventory.cylinders[size].price = cylinders[size].price;
        }
      });

      // ✅ CRITICAL: Mark cylinders as modified for Mixed type
      inventory.markModified('cylinders');

      inventory.addOns = addOns.length ? addOns : inventory.addOns;

      await inventory.save();

      // ✅ If pricePerKg changed, update all other inventories in the same city for this seller
      if (pricePerKg !== undefined && oldPricePerKg !== newPricePerKg) {
        await Inventory.updateMany(
          {
            seller: req.user._id,
            city: inventory.city,
            _id: { $ne: inventory._id } // Exclude the current inventory
          },
          {
            $set: { pricePerKg: newPricePerKg }
          }
        );

        console.log(`✅ Updated pricePerKg to ${newPricePerKg} for all inventories in ${inventory.city}`);
      }

      return res.json({
        success: true,
        message: 'Inventory updated successfully',
        inventory,
        cityWidePriceUpdate: pricePerKg !== undefined && oldPricePerKg !== newPricePerKg
      });
    }

    // If no inventory exists, create a new entry
    inventory = new Inventory({
      seller: req.user._id,
      locationid: locationObjectId,
      location,
      city,
      pricePerKg,
      cylinders,
      addOns
    });

    await inventory.save();

    // ✅ Update all existing inventories in the same city for this seller
    const updateResult = await Inventory.updateMany(
      {
        seller: req.user._id,
        city: city,
        _id: { $ne: inventory._id } // Exclude the newly created inventory
      },
      {
        $set: { pricePerKg: pricePerKg }
      }
    );

    console.log(`✅ Updated pricePerKg to ${pricePerKg} for ${updateResult.modifiedCount} existing inventories in ${city}`);

    res.json({
      success: true,
      message: 'Inventory created successfully',
      inventory,
      cityWidePriceUpdate: updateResult.modifiedCount > 0,
      updatedLocationsCount: updateResult.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

const getInventory = async (req, res, next) => {
  try {
    const { city } = req.query;
    const sellerId = req.user._id;

    // Build query for filtering inventories
    const query = { seller: sellerId };

    // Case-insensitive city search
    if (city) {
      query.city = { $regex: new RegExp(`^${city}$`, 'i') };
    }

    // Fetch inventories with location details
    const inventories = await Inventory.find(query)
      .populate('locationid', 'warehouseName address city')
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Get the pricePerKg for the city (should be same for all locations in the city)
    const cityPricePerKg = inventories.length > 0 ? inventories[0].pricePerKg : null;

    // Add stats for each inventory
    const inventoriesWithStats = await Promise.all(
      inventories.map(async (inventory) => {
        // Count issued cylinders for THIS specific warehouse/inventory
        const issuedCylinders = await Order.countDocuments({
          seller: sellerId,
          warehouse: inventory._id,
          status: { $in: ["pickup_ready", "completed"] }
        });

        // Count empty cylinders for THIS specific warehouse
        const emptyCylinders = await Cylinder.countDocuments({
          seller: sellerId,
          warehouse: inventory._id,
          status: 'empty'
        });

        // Calculate total inventory in stock
        const totalInventory =
          (inventory.cylinders?.['15kg']?.quantity || 0) +
          (inventory.cylinders?.['11.8kg']?.quantity || 0) +
          (inventory.cylinders?.['6kg']?.quantity || 0) +
          (inventory.cylinders?.['4.5kg']?.quantity || 0);

        // Count total addOns
        const totalAddOns = inventory.addOns?.length || 0;

        return {
          ...inventory,
          issuedCylinders,
          emptyCylinders,
          totalInventory,
          totalAddOns
        };
      })
    );

    // Calculate overall totals
    const totalInventories = inventoriesWithStats.reduce((sum, inv) => sum + inv.totalInventory, 0);
    const totalAddOns = inventoriesWithStats.reduce((sum, inv) => sum + inv.totalAddOns, 0);

    res.json({
      success: true,
      count: inventoriesWithStats.length,
      totalInventories,
      totalAddOns,
      pricePerKg: cityPricePerKg, // ✅ City-wide price per kg
      city: city || 'All Cities', // ✅ Show which city this price is for
      inventories: inventoriesWithStats
    });
  } catch (error) {
    console.error("❌ Error in getInventory:", error);
    next(error);
  }
};

const updateCityPrice = async (req, res, next) => {
  try {
    const { city, pricePerKg } = req.body;
    const sellerId = req.user._id;

    // Validate input
    if (!city || city.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'City is required'
      });
    }

    if (pricePerKg === undefined || pricePerKg === null) {
      return res.status(400).json({
        success: false,
        message: 'pricePerKg is required'
      });
    }

    if (typeof pricePerKg !== 'number' || pricePerKg < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price per kg must be a positive number'
      });
    }

    // Check if seller has any inventories in this city
    const inventoryCount = await Inventory.countDocuments({
      seller: sellerId,
      city: { $regex: new RegExp(`^${city.trim()}$`, 'i') }
    });

    if (inventoryCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No inventories found for city: ${city}`
      });
    }

    // Update ONLY pricePerKg for all inventories in the city
    const updateResult = await Inventory.updateMany(
      {
        seller: sellerId,
        city: { $regex: new RegExp(`^${city.trim()}$`, 'i') }
      },
      {
        $set: { pricePerKg: pricePerKg }
      }
    );

    console.log(`✅ Updated pricePerKg to ${pricePerKg} for ${updateResult.modifiedCount} inventories in ${city}`);

    res.json({
      success: true,
      message: `Price per kg updated successfully for all inventories in ${city}`,
      data: {
        city: city.trim(),
        pricePerKg: pricePerKg,
        updatedCount: updateResult.modifiedCount,
        totalInventories: inventoryCount
      }
    });
  } catch (error) {
    console.error("❌ Error in updateCityPrice:", error);
    next(error);
  }
};

const updateInventoryQuantity = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const { cylinders } = req.body;

    const inventory = await Inventory.findOne({
      _id: inventoryId,
      seller: req.user._id
    });

    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory not found' });
    }

    Object.keys(cylinders).forEach(size => {
      if (cylinders[size].quantity !== undefined) inventory.cylinders[size].quantity = cylinders[size].quantity;
      if (cylinders[size].price !== undefined) inventory.cylinders[size].price = cylinders[size].price;
    });

    await inventory.save();

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      inventory
    });
  } catch (error) {
    next(error);
  }
};

// ==================== CYLINDER & ORDER CONTROLLERS ====================
const getActiveCylindersMap = async (req, res, next) => {
  try {
    const cylinders = await Cylinder.find({
      seller: req.user._id,
      status: 'active',
      currentLocation: { $exists: true }
    })
      .populate('buyer', 'fullName phoneNumber')
      .select('size currentLocation serialNumber customName status lastUpdated');

    res.json({
      success: true,
      cylinders: cylinders.map(cyl => ({
        _id: cyl._id,
        size: cyl.size,
        buyer: cyl.buyer,
        currentLocation: cyl.currentLocation,
        serialNumber: cyl.serialNumber,
        customName: cyl.customName,
        status: cyl.status,
        lastUpdated: cyl.lastUpdated
      }))
    });
  } catch (error) {
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = { seller: req.user._id };

    // --------------------------------------------------
    // NEW FILTER LOGIC
    // --------------------------------------------------
    if (status) {
      switch (status) {
        case 'pending':
          query.status = 'pending';
          break;
        case 'refill':
          query.status = 'refill_requested';
          break;
        case 'inprocess':
          query.status = { $in: ['in_transit', 'pickup_ready', 'assigned'] };
          break;
        case 'delivered':
          query.status = 'delivered';
          break;
        case 'completed':
          query.status = 'completed';
          break;
        default:
          // exact match for any other status string
          query.status = status;
          break;
      }
    }
    // --------------------------------------------------

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('buyer', 'fullName phoneNumber addresses')
        .populate('seller', 'businessName phoneNumber')
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



const approveRefill = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { orderId } = req.params;
    const { warehouseId, notes } = req.body;

    console.log(`🔍 DEBUG: approveRefill called for Order ${orderId}`);
    console.log(`   Seller: ${sellerId}, Warehouse: ${warehouseId}`);

    const order = await Order.findOne({ orderId: orderId, seller: sellerId })
      .populate('warehouse', 'location city')
      .populate('buyer', 'fullName phoneNumber');

    if (!order) {
      console.log('❌ DEBUG: Order not found or unauthorized');
      return res.status(404).json({
        success: false,
        message: 'Order not found or unauthorized'
      });
    }

    console.log(`   Order Status: ${order.status}`);

    // Only allow approval if status is 'refill_requested'
    if (order.status !== 'refill_requested') {
      console.log('❌ DEBUG: Invalid status for approveRefill');
      return res.status(400).json({
        success: false,
        message: 'This endpoint is for refill requests only. Use /ready for new orders.'
      });
    }

    const inventory = await Inventory.findOne({ locationid: warehouseId, seller: sellerId });
    if (!inventory) {
      console.log('❌ DEBUG: Warehouse inventory not found');
      return res.status(404).json({
        success: false,
        message: 'Warehouse not found for this seller'
      });
    }

    // Check inventory stock
    const availableQty = inventory.cylinders[order.cylinderSize]?.quantity || 0;
    console.log(`   Inventory Check: Size ${order.cylinderSize}, Available: ${availableQty}, Required: ${order.quantity}`);

    if (availableQty < order.quantity) {
      console.log('❌ DEBUG: Insufficient stock');
      return res.status(400).json({
        success: false,
        message: 'Not enough filled cylinders available in this warehouse'
      });
    }

    // Update Inventory
    inventory.issuedCylinders = (inventory.issuedCylinders || 0) + order.quantity;
    inventory.cylinders[order.cylinderSize].quantity = availableQty - order.quantity;
    await inventory.save();
    console.log('✅ DEBUG: Inventory stock deducted');

    // ✅ ADD DRIVER ASSIGNMENT BASED ON ZONE
    const driver = await findDriverByZone(order.deliveryLocation.location);
    if (driver) {
      console.log(`✅ DEBUG: Driver assigned: ${driver._id}`);
      order.driver = driver._id;

      // Update driver status
      await User.findByIdAndUpdate(driver._id, {
        driverStatus: 'available', // Keep available to take more? usually 'busy' if one-at-a-time.
        // currentOrder: order._id // Deprecated?
      });

      // Assign Driver Earnings
      order.driverEarnings.push({
        driver: driver._id,
        amount: order.pricing.deliveryCharges,
        status: 'paid', // or pending
        createdAt: new Date()
      });
      order.status = 'assigned'; // Refill accepted/ready
      order.statusHistory.push({
        status: 'assigned',
        updatedBy: req.user._id,
        notes: 'Seller approved refill and driver assigned'
      });
    } else {
      console.log('⚠️ DEBUG: No driver found in zone');
      order.status = 'pickup_ready';
      order.statusHistory.push({
        status: 'pickup_ready',
        updatedBy: req.user._id,
        notes: 'Seller approved refill. No driver immediately available.'
      });
    }

    order.warehouse = warehouseId;

    // ✅ PAYMENT TIMELINE
    order.paymentTimeline.push({
      timelineId: new mongoose.Types.ObjectId().toString(),
      type: 'delivery_fee',
      cause: 'Delivery Charge',
      amount: order.pricing.deliveryCharges || 0,
      liabilityType: 'revenue',
      status: 'completed', // Validator fix: changed 'paid' to 'completed'
      driverId: driver ? driver._id : null,
      createdAt: new Date()
    });

    await order.save();
    console.log('✅ DEBUG: Order status updated to pickup_ready');

    // Notify Driver (if assigned) and Buyer
    const notifyEvent = driver ? 'refill_pickup' : 'order_assigned'; // reuse 'order_assigned' for generic 'ready'
    await NotificationService.sendOrderNotification(order, notifyEvent);

    // Notify Admin of Status Change
    notifyOrderStatusChange(order, 'refill_requested');

    const responseOrder = await Order.findById(order._id)
      .populate('buyer', 'fullName phoneNumber')
      .populate('seller', 'businessName phoneNumber')
      .populate('driver', 'fullName phoneNumber');

    res.json({
      success: true,
      message: 'Refill approved and marked ready for pickup',
      order: responseOrder,
      data: {
        orderId: order._id,
        driverAssigned: !!driver,
      }
    });

  } catch (error) {
    console.error('❌ DEBUG: Exception in approveRefill:', error);
    next(error);
  }
};

const markOrderReadyForPickup = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { orderId } = req.params;
    // For new orders, 'warehouseId' is usually already in order.warehouse
    // But if provided, we could validate it.

    const order = await Order.findOne({ orderId: orderId, seller: sellerId })
      .populate('warehouse', 'location city')
      .populate('buyer', 'fullName phoneNumber');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending orders can be marked ready' });
    }

    // Inventory was ALREADY deducted during createOrder.
    // We just need to assign driver and move status.

    // ✅ ADD DRIVER ASSIGNMENT BASED ON ZONE
    const driver = await findDriverByZone(order.deliveryLocation.location);

    if (driver) {
      order.driver = driver._id;
      // Assign Driver Earnings
      order.driverEarnings.push({
        driver: driver._id,
        amount: order.pricing.deliveryCharges,
        status: 'paid', // or pending
        createdAt: new Date()
      });
      // ✅ CHANGE: Status becomes 'assigned' if driver is found
      order.status = 'assigned';
      order.statusHistory.push({
        status: 'assigned',
        updatedBy: req.user._id,
        notes: 'Seller marked ready & Driver assigned'
      });
    } else {
      // No driver found, waiting for one
      order.status = 'pickup_ready';
      order.statusHistory.push({
        status: 'pickup_ready',
        updatedBy: req.user._id,
        notes: 'Seller marked order ready for pickup (No driver yet)'
      });
    }

    // Add delivery fee to timeline if not there? 
    // Usually added at creation for New Orders? 
    // Let's check createOrder... it DOES NOT add delivery fee to paymentTimeline, only gas sale.
    // So we add it here.
    order.paymentTimeline.push({
      timelineId: new mongoose.Types.ObjectId().toString(),
      type: 'delivery_fee',
      cause: 'Delivery Charge',
      amount: order.pricing.deliveryCharges || 0,
      liabilityType: 'revenue',
      status: 'pending',
      driverId: driver ? driver._id : null,
      createdAt: new Date()
    });

    await order.save();

    // Notify
    const notifyEvent = driver ? 'order_assigned' : 'order_status_update';
    await NotificationService.sendOrderNotification(order, notifyEvent);

    // Notify Admin of Status Change
    notifyOrderStatusChange(order, 'pending');

    res.json({
      success: true,
      message: 'Order marked ready for pickup',
      order
    });

  } catch (error) {
    next(error);
  }
};

const findDriverByZone = async (location, session = null) => {
  try {
    const drivers = await User.find({
      role: 'driver',
      autoAssignOrders: true,
      driverStatus: 'available',
      driverStatus: { $in: ['available', 'online'] } // Consider both available and online
    }).session(session || null);

    if (!drivers.length) return null;

    // Find driver whose zone includes the delivery location
    for (const driver of drivers) {
      if (!driver.zone || !driver.zone.centerPoint) continue;

      const driverLocation = {
        type: 'Point',
        coordinates: [driver.zone.centerPoint.longitude, driver.zone.centerPoint.latitude]
      };

      // Check if the delivery location is within driver's zone radius
      const distance = calculateDistance(
        driverLocation.coordinates[1],  // latitude
        driverLocation.coordinates[0],  // longitude
        location.coordinates[1],        // delivery latitude
        location.coordinates[0]         // delivery longitude
      );

      if (distance <= (driver.zone.radiusKm || 10)) { // Default 10km radius
        return driver;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding driver by zone:', error);
    return null;
  }
};

// Helper function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};


// ==================== INVOICE & DASHBOARD ====================

const generateInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId: orderId,
      seller: req.user._id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot generate invoice for unpaid order'
      });
    }

    const { invoiceNumber, invoiceUrl } = await InvoiceService.generateInvoice(orderId);

    res.json({
      success: true,
      message: 'Invoice generated successfully',
      invoiceUrl,
      invoiceNumber
    });
  } catch (error) {
    next(error);
  }
};


const getDashboardStats = async (req, res, next) => {
  try {
    const sellerId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1️⃣ Get all inventories for this seller and populate their locations
    const inventories = await Inventory.find({ seller: sellerId })
      .populate({ path: 'locationid', model: 'Location', select: 'warehouseName city address' })
      .lean();

    // 2️⃣ Filter only those inventories that have a valid location
    const inventoriesWithLocation = inventories.filter(inv => inv.locationid);

    // 3️⃣ Extract unique locations from inventories
    const locationsWithInventory = inventoriesWithLocation.map(inv => ({
      _id: inv.locationid._id,
      warehouseName: inv.locationid.warehouseName,
      city: inv.locationid.city,
      address: inv.locationid.address,
      pricePerKg: inv.pricePerKg,
      totalInventory: inv.totalInventory,
    }));

    // 4️⃣ Active cylinders
    // 4️⃣ Active cylinders (Refactored to fetch actual ASSETS)
    const activeCylinders = await Cylinder.find({
      seller: sellerId,
      status: { $in: ['active', 'in_transit'] }
    })
      .populate('order', 'orderId status')
      .populate('buyer', 'fullName phoneNumber')
      .populate('seller', 'businessName phoneNumber')
      .populate({
        path: 'warehouse',
        populate: {
          path: 'locationid',
          model: 'Location',
          select: 'warehouseName city address',
        },
      })
      .lean();

    const activeCylinderList = activeCylinders.map((cyl) => ({
      orderId: cyl.order?.orderId || 'N/A',
      buyer: cyl.buyer,
      status: cyl.status, // Asset Status
      cylinderSize: cyl.size,
      quantity: 1, // Single Asset
      warehouseName: cyl.warehouse?.locationid?.warehouseName || 'N/A',
      city: cyl.warehouse?.locationid?.city || 'N/A',
      address: cyl.warehouse?.locationid?.address || 'N/A',
    }));

    // 5️⃣ Aggregations for revenue
    const [revenueTodayAgg, revenueWeekAgg, revenueMonthAgg] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            'payment.status': 'completed',
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } },
      ]),
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            'payment.status': 'completed',
            createdAt: { $gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } },
      ]),
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            'payment.status': 'completed',
            createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) },
          },
        },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } },
      ]),
    ]);

    // 6️⃣ Count stats
    const [
      emptyCylinders,
      newOrders,
      inProcessOrders,
      completedOrders,
      returnRequests,
      refillRequests,
    ] = await Promise.all([
      Cylinder.countDocuments({ seller: sellerId, status: 'empty' }),
      // Include 'refill_requested' in New Orders so they appear in the main alert badge
      Order.countDocuments({ seller: sellerId, status: { $in: ['pending', 'assigned', 'refill_requested'] } }),
      Order.countDocuments({ seller: sellerId, status: { $in: ['pickup_ready', 'in_transit'] } }),
      Order.countDocuments({ seller: sellerId, status: 'completed' }),
      Order.countDocuments({ seller: sellerId, orderType: 'return', status: { $in: ['return_requested', 'return_pickup'] } }),
      Order.countDocuments({ seller: sellerId, orderType: 'refill', status: 'refill_requested' }),
    ]);

    // ✅ Final response
    res.json({
      success: true,
      stats: {
        totalInventories: inventoriesWithLocation.length,
        issuedCylinders: activeCylinders.length,
        emptyCylinders,
        newOrders,
        inProcessOrders,
        completedOrders,
        returnRequests,
        refillRequests,
        pendingReturns: await Order.countDocuments({ seller: sellerId, status: 'empty_return' }),
        revenue: {
          today: revenueTodayAgg[0]?.total || 0,
          thisWeek: revenueWeekAgg[0]?.total || 0,
          thisMonth: revenueMonthAgg[0]?.total || 0,
        },
        activeCylinders: activeCylinderList,
        locationsWithInventory, // ⬅️ only locations that have inventory
      },
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
};



const getDashboardStatsByWarehouse = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { warehouseId } = req.body; // This is locationId

    if (!warehouseId) {
      return res.status(400).json({
        success: false,
        message: "warehouseId is required",
      });
    }

    const warehouseObjectId = new mongoose.Types.ObjectId(warehouseId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 🔹 Fetch Inventory for this seller & location (warehouse)
    const inventory = await Inventory.findOne({
      locationid: warehouseObjectId,
      seller: sellerId,
    })
      .populate({
        path: "locationid",
        model: "Location",
        select: "warehouseName city address",
      })
      .lean();

    if (!inventory) {
      return res.status(200).json({
        success: true,
        stats: {
          totalInventories: 0,
          issuedCylinders: 0,
          emptyCylinders: 0,
          newOrders: 0,
          inProcessOrders: 0,
          completedOrders: 0,
          returnRequests: 0,
          refillRequests: 0,
          revenue: {
            today: 0,
            thisWeek: 0,
            thisMonth: 0,
          },
          activeCylinders: [],
          locationsWithInventory: [],
        },
      });
    }

    // 🔹 Calculate total inventory
    const totalInventories =
      (inventory.cylinders?.["15kg"]?.quantity || 0) +
      (inventory.cylinders?.["11.8kg"]?.quantity || 0) +
      (inventory.cylinders?.["6kg"]?.quantity || 0) +
      (inventory.cylinders?.["4.5kg"]?.quantity || 0);

    // 🔹 Active cylinders (Refactored to fetch actual ASSETS)
    const activeCylinders = await Cylinder.find({
      seller: sellerId,
      warehouse: inventory._id,
      status: { $in: ["active", "in_transit"] }
    })
      .populate('order', 'orderId status')
      .populate('buyer', 'fullName phoneNumber')
      .populate('seller', 'businessName phoneNumber')
      .populate({
        path: 'warehouse',
        populate: {
          path: 'locationid',
          model: 'Location',
          select: 'warehouseName city address',
        },
      })
      .lean();

    const activeCylinderList = activeCylinders.map((cyl) => ({
      orderId: cyl.order?.orderId || "N/A",
      buyer: cyl.buyer,
      status: cyl.status,
      cylinderSize: cyl.size,
      quantity: 1, // Single Asset
      warehouseName: cyl.warehouse?.locationid?.warehouseName || "N/A",
      city: cyl.warehouse?.locationid?.city || "N/A",
      address: cyl.warehouse?.locationid?.address || "N/A",
    }));

    // 🔹 Count stats
    const [
      emptyCylinders,
      newOrders,
      inProcessOrders,
      completedOrders,
      returnRequests,
      refillRequests,
    ] = await Promise.all([
      Cylinder.countDocuments({ seller: sellerId, warehouse: inventory._id, status: "empty" }),
      Order.countDocuments({
        seller: sellerId,
        warehouse: inventory._id,
        status: { $in: ["pending", "assigned"] },
      }),
      Order.countDocuments({
        seller: sellerId,
        warehouse: inventory._id,
        status: { $in: ["pickup_ready", "in_transit"] },
      }),
      Order.countDocuments({ seller: sellerId, warehouse: inventory._id, status: "completed" }),
      Order.countDocuments({
        seller: sellerId,
        warehouse: inventory._id,
        orderType: "return",
        status: "return_requested",
      }),
      Order.countDocuments({
        seller: sellerId,
        warehouse: inventory._id,
        orderType: "refill",
        status: "refill_requested",
      }),
    ]);

    // 🔹 Revenue calculations
    const [revenueTodayAgg, revenueWeekAgg, revenueMonthAgg] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            warehouse: inventory._id,
            "payment.status": "completed",
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        { $group: { _id: null, total: { $sum: "$pricing.grandTotal" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            warehouse: inventory._id,
            "payment.status": "completed",
            createdAt: { $gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        { $group: { _id: null, total: { $sum: "$pricing.grandTotal" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            seller: sellerId,
            warehouse: inventory._id,
            "payment.status": "completed",
            createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) },
          },
        },
        { $group: { _id: null, total: { $sum: "$pricing.grandTotal" } } },
      ]),
    ]);

    // 🔹 Prepare location info for response
    const locationsWithInventory = [
      {
        _id: inventory.locationid._id,
        warehouseName: inventory.locationid.warehouseName,
        city: inventory.locationid.city,
        address: inventory.locationid.address,
        pricePerKg: inventory.pricePerKg,
        totalInventory: totalInventories,
      },
    ];

    // ✅ Final unified response (same as getDashboardStats)
    res.status(200).json({
      success: true,
      stats: {
        totalInventories,
        issuedCylinders: activeCylinders.length,
        emptyCylinders,
        newOrders,
        inProcessOrders,
        completedOrders,
        returnRequests,
        refillRequests,
        pendingReturns: await Order.countDocuments({ seller: sellerId, warehouse: inventory._id, status: 'empty_return' }),
        revenue: {
          today: revenueTodayAgg[0]?.total || 0,
          thisWeek: revenueWeekAgg[0]?.total || 0,
          thisMonth: revenueMonthAgg[0]?.total || 0,
        },
        activeCylinders: activeCylinderList,
        locationsWithInventory, // ⬅️ matches main dashboard
      },
    });
  } catch (error) {
    console.error("❌ Error in getDashboardStatsByWarehouse:", error);
    next(error);
  }
};







// ==================== PROFILE ====================

const getSellerProfile = async (req, res, next) => {
  try {
    const seller = await User.findById(req.user._id).select('-password -refreshToken -otp');
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const [locations, inventory, totalOrders, totalRevenue] = await Promise.all([
      Location.find({ seller: req.user._id }),
      Inventory.find({ seller: req.user._id }).populate('location'),
      Order.countDocuments({ seller: req.user._id }),
      Order.aggregate([
        { $match: { seller: req.user._id, 'payment.status': 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
      ])
    ]);

    res.json({
      success: true,
      seller: {
        ...seller.toObject(),
        locations,
        inventory,
        stats: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateSellerProfile = async (req, res, next) => {
  try {
    const { businessName, email, phoneNumber } = req.body;
    const seller = await User.findById(req.user._id);

    if (phoneNumber && phoneNumber !== seller.phoneNumber) {
      const existingUser = await User.findOne({ phoneNumber, _id: { $ne: req.user._id } });
      if (existingUser) return res.status(400).json({ success: false, message: 'Phone number already in use' });
    }

    if (email && email !== seller.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (existingUser) return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    if (businessName) seller.businessName = businessName;
    if (email) seller.email = email;
    if (phoneNumber) seller.phoneNumber = phoneNumber;

    await seller.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      seller: {
        _id: seller._id,
        businessName: seller.businessName,
        email: seller.email,
        phoneNumber: seller.phoneNumber,
        sellerStatus: seller.sellerStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

// ==================== EXPORTS ====================




module.exports = {
  updateCityPrice,
  getDashboardStatsByWarehouse,
  addLocation,
  getMyLocations,
  updateLocation,
  addUpdateInventory,
  getInventory,
  updateInventoryQuantity,
  getActiveCylindersMap,
  getOrders,
  approveRefill,
  markOrderReadyForPickup,
  generateInvoice,
  getDashboardStats,
  getSellerProfile,
  updateSellerProfile,

};












//
//
// // ✅ Generate Bulk Test Data
// const generateBulkTestData = async (req, res, next) => {
//   try {
//     const sellerId = req.user._id;
//
//     // Ensure seller is approved
//     if (req.user.sellerStatus !== 'approved') {
//       return res.status(403).json({
//         success: false,
//         message: 'Your seller account must be approved to generate test data'
//       });
//     }
//
//     // Sample data
//     const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'];
//     const warehouseNames = ['Main Warehouse', 'Central Storage', 'North Depot', 'South Facility', 'East Distribution Center'];
//     const addresses = [
//       '123 Commercial Area, DHA',
//       '456 Industrial Zone, Korangi',
//       '789 Main Boulevard, Gulberg',
//       '321 Sector F-8',
//       '654 Model Town'
//     ];
//
//     // ✅ Create buyers
//     const buyers = await createTestBuyers();
//
//     // ✅ Create seller locations
//     const locations = [];
//     for (let i = 0; i < 3; i++) {
//       const location = await Location.create({
//         // locationid:
//         seller: sellerId,
//         warehouseName: warehouseNames[i],
//         city: cities[i % cities.length],
//         address: addresses[i],
//         location: {
//           type: 'Point',
//           coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
//         },
//         isActive: true
//       });
//       locations.push(location);
//     }
//
//     // ✅ Create inventories (matches Inventory schema)
//     const inventories = [];
//     for (const location of locations) {
//       const inventory = await Inventory.create({
//         locationid:location._id,
//         seller: sellerId,
//         location: location.warehouseName,
//         city: location.city,
//         cylinders: {
//           '4.5kg': { quantity: 50 + Math.floor(Math.random() * 50), price: 700 },
//           '6kg': { quantity: 40 + Math.floor(Math.random() * 40), price: 1000 },
//           '11.8kg': { quantity: 30 + Math.floor(Math.random() * 30), price: 1800 },
//           '15kg': { quantity: 20 + Math.floor(Math.random() * 20), price: 2300 }
//         },
//         addOns: [
//           { title: 'Regulator', price: 300, quantity: 50 },
//           { title: 'Pipe', price: 200, quantity: 40 },
//           { title: 'Safety Cap', price: 100, quantity: 60 }
//         ],
//         pricePerKg: 150,
//       });
//       inventories.push(inventory);
//     }
//
//     // ✅ Create cylinders
//     const cylinders = [];
//     const cylinderSizes = ['4.5kg', '6kg', '11.8kg', '15kg'];
//     for (let i = 0; i < 50; i++) {
//       const size = cylinderSizes[Math.floor(Math.random() * cylinderSizes.length)];
//       const status = Math.random() > 0.3 ? 'active' : 'empty';
//       const buyer = status === 'active' ? buyers[Math.floor(Math.random() * buyers.length)]._id : null;
//
//       const cylinder = await Cylinder.create({
//         seller: sellerId,
//         buyer,
//         serialNumber: `CYL${Date.now()}${i}`,
//         customName: `Cylinder-${i + 1}`,
//         size,
//         weights: {
//           tareWeight: 10,
//           netWeight: parseFloat(size) || 6,
//           grossWeight: 10 + (parseFloat(size) || 6),
//           weightDifference: 0
//         },
//         qrCode: `QR${Date.now()}${i}`,
//         status,
//         lastUpdated: new Date(),
//         currentLocation: {
//           type: 'Point',
//           coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
//         },
//         pricePerKg: 100,
//       });
//       cylinders.push(cylinder);
//     }
//
//     // ✅ Create orders
//     const orders = [];
//     const orderStatuses = ['pending', 'assigned', 'pickup_ready', 'in_transit', 'completed'];
//     const orderTypes = ['refill', 'new', 'return'];
//
//     for (let i = 0; i < 30; i++) {
//       const buyer = buyers[Math.floor(Math.random() * buyers.length)];
//       const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
//       const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
//       const inventory = inventories[Math.floor(Math.random() * inventories.length)];
//       const cylinder = orderType === 'return'
//           ? cylinders.find(c => c.buyer && c.buyer.toString() === buyer._id.toString())
//           : null;
//
//       const basePrice = 1500 + Math.floor(Math.random() * 1000);
//       const deliveryFee = 200;
//       const tax = basePrice * 0.16;
//       const grandTotal = basePrice + deliveryFee + tax;
//
//       const order = await Order.create({
//         orderId: `ORD${Date.now()}${i}`,
//         seller: "6908a20cb53c0ae2d09fa3e3",
//         buyer: buyer._id,
//         driver: Math.random() > 0.5 ? await getRandomDriver() : null,
//         orderType,
//         status,
//         cylinderSize: cylinderSizes[Math.floor(Math.random() * cylinderSizes.length)],
//         existingCylinder: cylinder ? cylinder._id : null,
//         inventory: inventory._id,
//         deliveryAddress: buyer.addresses[0],
//         pricing: { basePrice, deliveryFee, tax, discount: 0, grandTotal },
//         payment: {
//           method: Math.random() > 0.5 ? 'cod' : 'credit_card',
//           status: ['in_transit', 'completed'].includes(status) ? 'completed' : 'pending',
//           transactionId: status === 'completed' ? `TXN${Date.now()}${i}` : null,
//           paidAt: status === 'completed' ? new Date() : null
//         },
//         statusHistory: [
//           { status: 'active', updatedBy: "6908a20cb53c0ae2d09fa3e3", timestamp: new Date(Date.now() - 2 * 86400000) },
//           ...(status !== 'pending' ? [{ status, updatedBy: "6908a20cb53c0ae2d09fa3e3", timestamp: new Date() }] : [])
//         ],
//         notes: `Test order ${i + 1}`,
//         estimatedDelivery: new Date(Date.now() + 2 * 86400000)
//       });
//       orders.push(order);
//     }
//
//     res.status(201).json({
//       success: true,
//       message: '✅ Bulk test data generated successfully',
//       summary: {
//         locations: locations.length,
//         inventories: inventories.length,
//         cylinders: cylinders.length,
//         orders: orders.length,
//         buyers: buyers.length
//       },
//       data: {
//         locations: locations.map(l => l._id),
//         inventories: inventories.map(i => i._id),
//         orders: orders.map(o => o.orderId)
//       }
//     });
//
//   } catch (error) {
//     next(error);
//   }
// };
//
// // ✅ Buyer Creation
// const createTestBuyers = async () => {
//   const buyers = [];
//   const buyerData = [
//     { fullName: 'Ahmed Khan', phoneNumber: `0300${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'ahmed.khan@example.com', userType: 'domestic', cnic: '12345-6789012-3' },
//     { fullName: 'Fatima Ali', phoneNumber: `0312${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'fatima.ali@example.com', userType: 'domestic', cnic: '23456-7890123-4' },
//     { fullName: 'Bilal Enterprises', phoneNumber: `0321${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'bilal.enterprises@example.com', userType: 'commercial', cnic: '34567-8901234-5' },
//     { fullName: 'Sara Restaurant', phoneNumber: `0333${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'sara.restaurant@example.com', userType: 'commercial', cnic: '45678-9012345-6' },
//     { fullName: 'Usman Traders', phoneNumber: `0345${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'usman.traders@example.com', userType: 'commercial', cnic: '56789-0123456-7' }
//   ];
//
//   for (const data of buyerData) {
//     let buyer = await User.findOne({ phoneNumber: data.phoneNumber, role: 'buyer' });
//     if (!buyer) {
//       buyer = await User.create({
//         role: 'buyer',
//         ...data,
//         password: 'password123',
//         isVerified: true,
//         addresses: [{
//           label: 'Home',
//           address: `${Math.floor(100 + Math.random() * 900)} Street, Sector ${Math.floor(1 + Math.random() * 10)}`,
//           location: {
//             type: 'Point',
//             coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
//           },
//           isDefault: true
//         }],
//         currentLocation: { type: 'Point', coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5] }
//       });
//     }
//     buyers.push(buyer);
//   }
//   return buyers;
// };
//
// // ✅ Random driver generator
// const getRandomDriver = async () => {
//   let driver = await User.findOne({ role: 'driver' });
//   if (!driver) {
//     driver = await User.create({
//       role: 'driver',
//       fullName: 'Driver Test',
//       phoneNumber: `0300${Math.floor(1000000 + Math.random() * 9000000)}`,
//       password: 'password123',
//       vehicleNumber: `ABC-${Math.floor(100 + Math.random() * 900)}`,
//       zone: 'Central',
//       driverStatus: 'available',
//       isVerified: true,
//       currentLocation: { type: 'Point', coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5] }
//     });
//   }
//   return driver._id;
// };
//
//
