const express = require('express');
const buyerController = require('../controllers/buyer.controller');
const auth = require('../middlewares/auth');

const router = express.Router();

// adjust this to your actual auth middleware export

/**
 * Routes for buyer operations
 *
 * Mount these routes under /buyers in your main app, e.g.
 * app.use('/buyers', require('./routes/buyer.routes'));
 */

// Add an address for the authenticated buyer
router.post('/address', auth.authenticate, buyerController.addAddress);

// Get nearby sellers (query: lat, lng, radius, sortBy)
router.get('/nearby-sellers', auth.authenticate, buyerController.getNearbySellers);

// Create a new order
router.post('/orders', auth.authenticate, buyerController.createOrder);

// Get buyer's cylinders (optional query param: status)
router.get('/cylinders', auth.authenticate, buyerController.getMyCylinders);

// Request a refill for a cylinder
router.post('/refill', auth.authenticate, buyerController.requestRefill);

// Scan QR code to confirm delivery
router.post('/scan-qrcode', auth.authenticate, buyerController.scanQRCode);

module.exports = router;