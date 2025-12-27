const errorMiddleware = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  
  // Log error
  console.error('Error:', err);
  
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new Error(message);
    error.statusCode = 404;
  }
  
  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new Error(message);
    error.statusCode = 400;
  }
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error = new Error(messages.join(', '));
    error.statusCode = 400;
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new Error('Invalid token');
    error.statusCode = 401;
  }
  
  if (err.name === 'TokenExpiredError') {
    error = new Error('Token expired');
    error.statusCode = 401;
  }
  
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorMiddleware;