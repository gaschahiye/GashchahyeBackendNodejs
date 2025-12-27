const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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
        
        // Join user-specific rooms
        socket.join(`user_${user._id}`);
        socket.join(`${user.role}_${user._id}`);
        
        socket.emit('authenticated', { 
          userId: user._id, 
          role: user.role 
        });
        
        console.log(`User ${user._id} (${user.role}) authenticated on socket ${socket.id}`);
      } catch (error) {
        socket.emit('auth_error', { message: 'Invalid token' });
      }
    });

    socket.on('driver_location_update', async (data) => {
      if (socket.userRole !== 'driver') return;
      
      await User.findByIdAndUpdate(socket.userId, {
        currentLocation: {
          type: 'Point',
          coordinates: [data.longitude, data.latitude]
        }
      });

      // Broadcast to relevant buyers
      const orders = await require('../models/Order').find({
        driver: socket.userId,
        status: 'in_transit'
      }).populate('buyer');

      orders.forEach(order => {
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

    socket.on('join_order_room', (data) => {
      socket.join(`order_${data.orderId}`);
    });

    socket.on('leave_order_room', (data) => {
      socket.leave(`order_${data.orderId}`);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initializeSocket, getIO };