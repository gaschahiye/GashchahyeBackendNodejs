require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const { initializeSocket } = require('./src/config/socket');

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Start server
const server = app.listen(PORT, () => {
     
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Initialize Socket.io
initializeSocket(server);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});