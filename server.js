require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const { initializeSocket } = require('./src/config/socket');

const PORT = process.env.PORT || 5000;

// Connect to database and sync sheet
connectDB().then(async () => {
  console.log('Database connected successfully');
  try {
    const { _rebuildSheetLogic, syncGoogleSheetInternal } = require('./src/controllers/admin.payment.controller');

    // Initial sync on startup
    console.log('[Startup] Auto-syncing Google Sheet Ledger...');
    const count = await _rebuildSheetLogic();
    console.log(`[Startup] Google Sheet synchronized with ${count} payment entries.`);

    // Start background "Heartbeat" sync every 1 minute
    console.log('[Background] Starting Google Sheet Auto-Polling (Interval: 1m)');
    setInterval(async () => {
      try {
        const { syncGoogleSheetInternal } = require('./src/controllers/admin.payment.controller');
        if (syncGoogleSheetInternal) {
          console.log('[Heartbeat] Polling Google Sheet for status updates...');
          await syncGoogleSheetInternal();
        }
      } catch (pollErr) {
        console.error('[Heartbeat] Auto-polling failed:', pollErr.message);
      }
    }, 60000); // 1 minute

  } catch (err) {
    console.error('[Startup] Google Sheet sync failed:', err.message);
  }
});

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