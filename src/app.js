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
    // 1.  allow any localhost / 127.0.0.1
    if (!origin || /^https?:\/\/localhost(:|$)/.test(origin) || /^https?:\/\/127\.0\.0\.1/.test(origin)) {
      return callback(null, true);
    }

    // 2.  strip trailing slashes from env list
    const envOrigins = (process.env.SOCKET_CORS_ORIGIN || '')
      .split(',')
      .map(o => o.replace(/\/+$/, '')); // remove trailing slashes

    if (envOrigins.includes(origin)) return callback(null, true);

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
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