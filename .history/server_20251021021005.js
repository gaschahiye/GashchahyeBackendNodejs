require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const { initializeSocket } = require('./src/config/socket');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Initialize Socket.io
initializeSocket(server);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  logger.info('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated!');
  });
});