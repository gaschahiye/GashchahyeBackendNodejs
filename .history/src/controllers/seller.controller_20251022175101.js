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





// ✅ Generate Bulk Test Data
const generateBulkTestData = async (req, res, next) => {
  try {
    const sellerId = req.user._id;

    // Ensure seller is approved
    if (req.user.sellerStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your seller account must be approved to generate test data'
      });
    }

    // Sample data
    const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'];
    const warehouseNames = ['Main Warehouse', 'Central Storage', 'North Depot', 'South Facility', 'East Distribution Center'];
    const addresses = [
      '123 Commercial Area, DHA',
      '456 Industrial Zone, Korangi',
      '789 Main Boulevard, Gulberg',
      '321 Sector F-8',
      '654 Model Town'
    ];

    // ✅ Create buyers
    const buyers = await createTestBuyers();

    // ✅ Create seller locations
    const locations = [];
    for (let i = 0; i < 3; i++) {
      const location = await Location.create({
        seller: sellerId,
        warehouseName: warehouseNames[i],
        city: cities[i % cities.length],
        address: addresses[i],
        location: {
          type: 'Point',
          coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
        },
        isActive: true
      });
      locations.push(location);
    }

    // ✅ Create inventories (fixed cylinder structure)
    const inventories = [];
    const cylinderSizes = ['4.5kg', '6kg', '11.8kg', '15kg'];

    for (const location of locations) {
      // Build inventory object safely
      const inventoryData = {
        seller: sellerId,
        location: location._id,
        city: location.city,
        cylinders: {
          '4.5kg': { quantity: 50 + Math.floor(Math.random() * 50), price: 700 },
          '6kg': { quantity: 40 + Math.floor(Math.random() * 40), price: 1000 },
          '11.8kg': { quantity: 30 + Math.floor(Math.random() * 30), price: 1800 },
          '15kg': { quantity: 20 + Math.floor(Math.random() * 20), price: 2300 }
        },
        addOns: [
          { title: 'Regulator', price: 300, quantity: 50 },
          { title: 'Pipe', price: 200, quantity: 40 },
          { title: 'Safety Cap', price: 100, quantity: 60 }
        ],
        pricePerKg: 150
      };

      // ✅ Ensure every cylinder key exists
      for (const size of cylinderSizes) {
        if (!inventoryData.cylinders[size]) {
          inventoryData.cylinders[size] = { quantity: 0, price: 0 };
        }
      }

      const inventory = await Inventory.create(inventoryData);
      inventories.push(inventory);
    }

    // ✅ Create cylinders
    const cylinders = [];
    for (let i = 0; i < 50; i++) {
      const size = cylinderSizes[Math.floor(Math.random() * cylinderSizes.length)];
      const status = Math.random() > 0.3 ? 'active' : 'empty';
      const buyer = status === 'active' ? buyers[Math.floor(Math.random() * buyers.length)]._id : null;

      const cylinder = await Cylinder.create({
        seller: sellerId,
        buyer,
        serialNumber: `CYL${Date.now()}${i}`,
        customName: `Cylinder-${i + 1}`,
        size,
        weights: {
          tareWeight: 10,
          netWeight: parseFloat(size) || 6,
          grossWeight: 10 + (parseFloat(size) || 6),
          weightDifference: 0
        },
        qrCode: `QR${Date.now()}${i}`,
        status,
        lastUpdated: new Date(),
        currentLocation: {
          type: 'Point',
          coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
        },
        pricePerKg: 100
      });
      cylinders.push(cylinder);
    }

    // ✅ Create orders
    const orders = [];
    const orderStatuses = ['pending', 'assigned', 'pickup_ready', 'in_transit', 'completed'];
    const orderTypes = ['refill', 'new', 'return'];

    for (let i = 0; i < 30; i++) {
      const buyer = buyers[Math.floor(Math.random() * buyers.length)];
      const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];
      const inventory = inventories[Math.floor(Math.random() * inventories.length)];
      const cylinder = orderType === 'return'
        ? cylinders.find(c => c.buyer && c.buyer.toString() === buyer._id.toString())
        : null;

      const basePrice = 1500 + Math.floor(Math.random() * 1000);
      const deliveryFee = 200;
      const tax = basePrice * 0.16;
      const grandTotal = basePrice + deliveryFee + tax;

     const order = await Order.create({
  orderId: `ORD${Date.now()}${i}`,
  seller: sellerId,
  buyer: buyer._id,
  driver: Math.random() > 0.5 ? await getRandomDriver() : null,
  orderType,
  status,
  cylinderSize: cylinderSizes[Math.floor(Math.random() * cylinderSizes.length)],
  existingCylinder: cylinder ? cylinder._id : null,
  inventory: inventory._id,

  // ✅ deliveryLocation must have address + coordinates
  deliveryLocation: {
    address: buyer.addresses[0]?.address || '123 Test Street',
    location: {
      type: 'Point',
      coordinates: [
        67.0 + Math.random() * 2,
        24.0 + Math.random() * 5
      ]
    }
  },

  // ✅ Use correct pricing structure as per schema
  pricing: {
    subtotal: basePrice,
    deliveryCharges: deliveryFee,
    cylinderPrice: basePrice,
    discount: 0,
    grandTotal
  },

  payment: {
    method: Math.random() > 0.5 ? 'cod' : 'debit_card',
    status: ['in_transit', 'completed'].includes(status) ? 'completed' : 'pending',
    transactionId: status === 'completed' ? `TXN${Date.now()}${i}` : null,
    paidAt: status === 'completed' ? new Date() : null
  },

  statusHistory: [
    { status: 'pending', updatedBy: sellerId, timestamp: new Date(Date.now() - 2 * 86400000) },
    ...(status !== 'pending' ? [{ status, updatedBy: sellerId, timestamp: new Date() }] : [])
  ],

  notes: `Test order ${i + 1}`,
  estimatedDelivery: new Date(Date.now() + 2 * 86400000)
});

      orders.push(order);
    }

    // ✅ Response
    res.status(201).json({
      success: true,
      message: '✅ Bulk test data generated successfully',
      summary: {
        locations: locations.length,
        inventories: inventories.length,
        cylinders: cylinders.length,
        orders: orders.length,
        buyers: buyers.length
      },
      data: {
        locations: locations.map(l => l._id),
        inventories: inventories.map(i => i._id),
        orders: orders.map(o => o.orderId)
      }
    });

  } catch (error) {
    next(error);
  }
};


// ✅ Buyer Creation
const createTestBuyers = async () => {
  const buyers = [];
  const buyerData = [
    { fullName: 'Ahmed Khan', phoneNumber: `0300${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'ahmed.khan@example.com', userType: 'domestic', cnic: '12345-6789012-3' },
    { fullName: 'Fatima Ali', phoneNumber: `0312${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'fatima.ali@example.com', userType: 'domestic', cnic: '23456-7890123-4' },
    { fullName: 'Bilal Enterprises', phoneNumber: `0321${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'bilal.enterprises@example.com', userType: 'commercial', cnic: '34567-8901234-5' },
    { fullName: 'Sara Restaurant', phoneNumber: `0333${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'sara.restaurant@example.com', userType: 'commercial', cnic: '45678-9012345-6' },
    { fullName: 'Usman Traders', phoneNumber: `0345${Math.floor(1000000 + Math.random() * 9000000)}`, email: 'usman.traders@example.com', userType: 'commercial', cnic: '56789-0123456-7' }
  ];

  for (const data of buyerData) {
    let buyer = await User.findOne({ phoneNumber: data.phoneNumber, role: 'buyer' });
    if (!buyer) {
      buyer = await User.create({
        role: 'buyer',
        ...data,
        password: 'password123',
        isVerified: true,
        addresses: [{
          label: 'Home',
          address: `${Math.floor(100 + Math.random() * 900)} Street, Sector ${Math.floor(1 + Math.random() * 10)}`,
          location: {
            type: 'Point',
            coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5]
          },
          isDefault: true
        }],
        currentLocation: { type: 'Point', coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5] }
      });
    }
    buyers.push(buyer);
  }
  return buyers;
};

// ✅ Random driver generator
const getRandomDriver = async () => {
  let driver = await User.findOne({ role: 'driver' });
  if (!driver) {
    driver = await User.create({
      role: 'driver',
      fullName: 'Driver Test',
      phoneNumber: `0300${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      vehicleNumber: `ABC-${Math.floor(100 + Math.random() * 900)}`,
      zone: 'Central',
      driverStatus: 'available',
      isVerified: true,
      currentLocation: { type: 'Point', coordinates: [67.0 + Math.random() * 2, 24.0 + Math.random() * 5] }
    });
  }
  return driver._id;
};




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
  updateSellerProfile,
  generateBulkTestData
};
