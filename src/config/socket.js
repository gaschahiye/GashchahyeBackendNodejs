const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Order = require('../models/Order');

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  console.log('✅ Socket.io initialized');

  io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // -------------------------
    // 🔐 AUTHENTICATION
    // -------------------------
    socket.on('authenticate', async (token) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
          socket.emit('auth_error', { message: 'User not found' });
          return;
        }

        socket.userId = user._id;
        socket.userRole = user.role;

        // Join role-based & user-specific rooms
        socket.join(`user_${user._id}`);
        socket.join(`${user.role}_${user._id}`);

        // NEW: Join admin room if user is admin
        if (user.role === 'admin') {
          socket.join('admin_notifications');
        }

        socket.emit('authenticated', {
          userId: user._id,
          role: user.role
        });

        console.log(`✅ User ${user._id} (${user.role}) authenticated`);
      } catch (error) {
        socket.emit('auth_error', { message: 'Invalid token' });
      }
    });

    // -------------------------
    // 🚚 DRIVER LOCATION UPDATES
    // -------------------------
    socket.on('driver_location_update', async (data) => {
      if (socket.userRole !== 'driver') return;

      await User.findByIdAndUpdate(socket.userId, {
        currentLocation: {
          type: 'Point',
          coordinates: [data.longitude, data.latitude]
        }
      });

      const orders = await Order.find({
        driver: socket.userId,
        status: 'in_transit'
      }).populate('buyer');

      orders.forEach((order) => {
        io.to(`user_${order.buyer._id}`).emit('driver_location_update', {
          orderId: order._id,
          location: {
            latitude: data.latitude,
            longitude: data.longitude
          },
          driver: {
            _id: socket.userId,
            vehicleNumber: socket.userVehicle
          }
        });
      });
    });

    // -------------------------
    // 📦 ROOM JOIN / LEAVE
    // -------------------------
    socket.on('join_order_room', (data) => {
      socket.join(`order_${data.orderId}`);
    });

    socket.on('leave_order_room', (data) => {
      socket.leave(`order_${data.orderId}`);
    });

    socket.on('join_seller_room', () => {
      if (socket.userRole === 'seller') {
        socket.join(`seller_${socket.userId}`);
      }
    });

    socket.on('join_driver_room', () => {
      if (socket.userRole === 'driver') {
        socket.join(`driver_${socket.userId}`);
      }
    });

    socket.on('join_order_tracking', (data) => {
      socket.join(`order_tracking_${data.orderId}`);
    });

    socket.on('join_seller_approval', () => {
      if (socket.userRole === 'seller') {
        socket.join(`seller_approval_${socket.userId}`);
      }
    });

    // NEW: Join admin notifications room
    socket.on('join_admin_notifications', () => {
      if (socket.userRole === 'admin') {
        socket.join('admin_notifications');
        console.log(`Admin ${socket.userId} joined admin notifications`);
      }
    });

    socket.on('disconnect', () => {
      console.log('❎ User disconnected:', socket.id);
    });
  });

  return io;
};

// -------------------------
// 📡 EMIT HELPERS (EXISTING)
// -------------------------
const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

const emitOrderStatusUpdate = (order) => {
  if (io) {
    const buyerId = order.buyer?._id || order.buyer;
    const sellerId = order.seller?._id || order.seller;
    const driverId = order.driver?._id || order.driver;

    if (buyerId) io.to(`user_${buyerId}`).emit('order_status_update', order);
    if (sellerId) io.to(`seller_${sellerId}`).emit('order_status_update', order);
    if (driverId) io.to(`driver_${driverId}`).emit('order_status_update', order);
    io.to(`order_tracking_${order._id}`).emit('order_status_update', order);
  }
};

const emitDriverLocationUpdate = (driverId, location, orderId) => {
  if (io) {
    io.to(`order_tracking_${orderId}`).emit('driver_location_update', {
      driverId,
      location,
      timestamp: new Date()
    });
  }
};

const emitSellerApproval = (sellerId, status) => {
  if (io) {
    io.to(`seller_approval_${sellerId}`).emit('seller_approval_update', {
      status,
      message:
        status === 'approved'
          ? 'Your seller account has been approved!'
          : 'Your seller account has been rejected.',
      timestamp: new Date()
    });
  }
};

// -------------------------
// 📢 NEW ADMIN NOTIFICATION FUNCTIONS
// Call these from your API controllers
// -------------------------

/**
 * 1. Call this when a new seller registers
 * From your seller registration API controller
 */
const notifyAdminNewSeller = (sellerData) => {
  if (!io) return;

  io.to('admin_notifications').emit('new_seller_registration', {
    type: 'new_seller',
    title: 'New Seller Registered',
    message: `${sellerData.businessName || sellerData.name} has registered`,
    sellerId: sellerData._id,
    businessName: sellerData.businessName,
    email: sellerData.email,
    timestamp: new Date()
  });

  console.log(`📢 Admin notified about new seller: ${sellerData.businessName}`);
};

/**
 * 2. Call this when a new order is placed
 * From your order creation API controller
 */
const notifyNewOrder = (orderData) => {
  if (!io) return;

  // Notify admin
  io.to('admin_notifications').emit('new_order_placed', {
    type: 'new_order',
    title: 'New Order Placed',
    message: `Order #${orderData.orderNumber || orderData._id} for ₹${orderData.totalAmount}`,
    orderId: orderData._id,
    orderNumber: orderData.orderNumber,
    totalAmount: orderData.totalAmount,
    buyerId: orderData.buyer,
    timestamp: new Date()
  });

  console.log(`📦 Order notification sent: ${orderData.orderNumber || orderData._id}`);
};

/**
 * 3. Call this when order status changes
 * From your order update API controller
 */
const notifyOrderStatusChange = (orderData, oldStatus) => {
  if (!io) return;

  // Notify admin
  io.to('admin_notifications').emit('order_status_changed', {
    type: 'order_status_update',
    title: 'Order Status Updated',
    message: `Order #${orderData.orderNumber || orderData._id} changed from ${oldStatus} to ${orderData.status}`,
    orderId: orderData._id,
    orderNumber: orderData.orderNumber,
    oldStatus,
    newStatus: orderData.status,
    timestamp: new Date()
  });

  console.log(`📊 Order status update: ${orderData.orderNumber || orderData._id} - ${oldStatus} → ${orderData.status}`);
};

module.exports = {
  initializeSocket,
  getIO,
  emitOrderStatusUpdate,
  emitDriverLocationUpdate,
  emitSellerApproval,
  // NEW FUNCTIONS
  notifyAdminNewSeller,
  notifyNewOrder,
  notifyOrderStatusChange
};