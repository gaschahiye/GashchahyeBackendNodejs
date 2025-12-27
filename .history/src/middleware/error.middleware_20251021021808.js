const logger = require('../utils/logger');

const errorMiddleware = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  logger.error(err);
  
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.statusCode = 404;
  }
  
  // Mongoose duplicate key
  if (err.code === 11000) {
    error.message = 'Duplicate field value entered';
    error.statusCode = 400;
  }
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message).join(', ');
    error.statusCode = 400;
  }
  
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorMiddleware;