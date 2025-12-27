// src/controllers/seller.controller.js
const User = require('../models/User');
const Location = require('../models/Location');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const Cylinder = require('../models/Cylinder');
const InvoiceService = require('../services/invoice.service');
const NotificationService = require('../services/notification.service');

// ==================== LOCATION CONTROLLERS ====================

const addLocation = async (req, res, next) => {
  try {
    const { warehouseName, city, address, location } = req.body;

    if (req.user.sellerStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account is not approved yet'
      });
    }

    const newLocation = await Location.create({
      seller: req.user._id,
      warehouseName,
      city,
      address,
      location: {
        type: 'Point',
        coordinates: location.coordinates
      }
    });

    res.status(201).json({
      success: true,
      message: 'Location added successfully',
      location: newLocation
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
    if (updates.location) location.location.coordinates = updates.location.coordinates;
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
    const { location, city, pricePerKg, cylinders, addOns = [] } = req.body;

    const locationDoc = await Location.findOne({
      _id: location,
      seller: req.user._id
    });

    if (!locationDoc) {
      return res.status(404).json({
        success: false,
        message: 'Location not found or unauthorized'
      });
    }

    let inventory = await Inventory.findOne({
      seller: req.user._id,
      location
    });

    if (inventory) {
      inventory.pricePerKg = pricePerKg;
      inventory.city = city;
      Object.keys(cylinders).forEach(size => {
        if (cylinders[size].quantity !== undefined) inventory.cylinders[size].quantity = cylinders[size].quantity;
        if (cylinders[size].price !== undefined) inventory.cylinders[size].price = cylinders[size].price;
      });
      inventory.addOns = addOns;
    } else {
      inventory = await Inventory.create({
        seller: req.user._id,
        location,
        city,
        pricePerKg,
        cylinders,
        addOns
      });
    }

    await inventory.save();

    res.json({
      success: true,
      message: inventory.isNew ? 'Inventory created successfully' : 'Inventory updated successfully',
      inventory
    });
  } catch (error) {
    next(error);
  }
};

const getInventory = async (req, res, next) => {
  try {
    const { city, location } = req.query;
    const query = { seller: req.user._id };
    if (city) query.city = city;
    if (location) query.location = location;

    const inventories = await Inventory.find(query)
      .populate('location', 'warehouseName address city')
      .sort({ createdAt: -1 });

    const inventoriesWithStats = await Promise.all(
      inventories.map(async (inventory) => {
        const issuedCylinders = await Cylinder.countDocuments({
          seller: req.user._id,
          status: 'active'
        });
        return { ...inventory.toObject(), issuedCylinders };
      })
    );

    res.json({ success: true, inventories: inventoriesWithStats });
  } catch (error) {
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
    const { status, page = 1, limit = 20 } = req.query;
    const query = { seller: req.user._id };
    if (status) query.status = status;

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

const markOrderReadyForPickup = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      seller: req.user._id
    }).populate('buyer').populate('driver');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!['pending', 'assigned'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be marked ready for pickup in current status' });
    }

    order.status = 'pickup_ready';
    order.sellerNotes = notes;
    order.statusHistory.push({
      status: 'pickup_ready',
      updatedBy: req.user._id,
      notes: `Seller marked order ready for pickup${notes ? ': ' + notes : ''}`
    });

    await order.save();

    if (order.driver) {
      await NotificationService.createNotification(order.driver._id, {
        title: 'Order Ready for Pickup',
        message: `Order ${order.orderId} is ready for pickup from your location.`,
        type: 'order_status_update',
        relatedOrder: order._id
      });
    }

    await NotificationService.sendOrderNotification(order, 'order_status_update');

    res.json({ success: true, message: 'Order marked as ready for pickup', order });
  } catch (error) {
    next(error);
  }
};

// ==================== INVOICE & DASHBOARD ====================

const generateInvoice = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
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

    const { invoiceNumber, invoiceUrl } = await InvoiceService.generateAndSaveInvoice(orderId);

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

    const [
      totalInventory,
      issuedCylinders,
      newOrders,
      inProcessOrders,
      completedOrders,
      returnRequests,
      refillRequests,
      emptyCylinders,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth
    ] = await Promise.all([
      Inventory.aggregate([
        { $match: { seller: sellerId } },
        { $group: { _id: null, total: { $sum: '$totalInventory' } } }
      ]),
      Cylinder.countDocuments({ seller: sellerId, status: 'active' }),
      Order.countDocuments({ seller: sellerId, status: { $in: ['pending', 'assigned'] } }),
      Order.countDocuments({ seller: sellerId, status: { $in: ['pickup_ready', 'in_transit'] } }),
      Order.countDocuments({ seller: sellerId, status: 'completed' }),
      Order.countDocuments({ seller: sellerId, orderType: 'return', status: 'return_requested' }),
      Order.countDocuments({ seller: sellerId, orderType: 'refill', status: 'refill_requested' }),
      Cylinder.countDocuments({ seller: sellerId, status: 'empty' }),
      Order.aggregate([
        { $match: { seller: sellerId, 'payment.status': 'completed', createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
      ]),
      Order.aggregate([
        { $match: { seller: sellerId, 'payment.status': 'completed', createdAt: { $gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
      ]),
      Order.aggregate([
        { $match: { seller: sellerId, 'payment.status': 'completed', createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) } } },
        { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalInventory: totalInventory[0]?.total || 0,
        issuedCylinders,
        newOrders,
        inProcessOrders,
        completedOrders,
        returnRequests,
        refillRequests,
        emptyCylinders,
        revenue: {
          today: revenueToday[0]?.total || 0,
          thisWeek: revenueThisWeek[0]?.total || 0,
          thisMonth: revenueThisMonth[0]?.total || 0
        }
      }
    });
  } catch (error) {
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
  addLocation,
  getMyLocations,
  updateLocation,
  addUpdateInventory,
  getInventory,
  updateInventoryQuantity,
  getActiveCylindersMap,
  getOrders,
  markOrderReadyForPickup,
  generateInvoice,
  getDashboardStats,
  getSellerProfile,
  updateSellerProfile
};
