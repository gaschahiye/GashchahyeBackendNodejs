// src/routes/index.js
const express = require('express');
const authRoutes = require('./auth.routes');
const buyerRoutes = require('./buyer.routes');
const sellerRoutes = require('./seller.routes'); // Add this
const driverRoutes = require('./driver.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/buyer', buyerRoutes);
router.use('/seller', sellerRoutes); // Add this line
router.use('/driver', driverRoutes);
router.use('/admin', adminRoutes);

module.exports = router;