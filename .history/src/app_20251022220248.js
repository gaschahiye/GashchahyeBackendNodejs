const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.SOCKET_CORS_ORIGIN || '*',
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
swaggerDocs(app);
// Routes
app.use('/api', routes);
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.method} ${req.path} not found` 
  });
});

// Error handling middleware
app.use(errorMiddleware);

module.exports = app;