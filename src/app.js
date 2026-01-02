const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');

const swaggerDocs = require('./config/swagger-docs');
const app = express();

// Middleware
app.use(helmet());

const corsOptions = {
  origin: (origin, callback) => {
    // Log the incoming origin for debugging
    console.log('[CORS] Request from origin:', origin);

    // 1. Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      console.log('[CORS] No origin - allowing (likely mobile app or API client)');
      return callback(null, true);
    }

    // 2. Allow any localhost / 127.0.0.1
    if (/^https?:\/\/localhost(:|$)/.test(origin) || /^https?:\/\/127\.0\.0\.1/.test(origin)) {
      console.log('[CORS] Localhost origin - allowing');
      return callback(null, true);
    }

    // 3. Strip trailing slashes from both origin and env list for comparison
    const normalizedOrigin = origin.replace(/\/+$/, '');
    const envOrigins = (process.env.SOCKET_CORS_ORIGIN || '')
      .split(',')
      .map(o => o.trim().replace(/\/+$/, '')) // trim whitespace and remove trailing slashes
      .filter(o => o.length > 0); // remove empty strings

    console.log('[CORS] Allowed origins:', envOrigins);
    console.log('[CORS] Normalized origin:', normalizedOrigin);

    if (envOrigins.includes(normalizedOrigin)) {
      console.log('[CORS] Origin matched - allowing');
      return callback(null, true);
    }

    console.error('[CORS] Origin NOT allowed:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


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