const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
console.log('authRoutes type:', typeof authRoutes);

const buyerRoutes = require('./buyer.routes');
console.log('buyerRoutes type:', typeof buyerRoutes);

const sellerRoutes = require('./seller.routes');
console.log('sellerRoutes type:', typeof sellerRoutes);

const driverRoutes = require('./driver.routes');
console.log('driverRoutes type:', typeof driverRoutes);

const adminRoutes = require('./admin.routes');
console.log('adminRoutes type:', typeof adminRoutes);

module.exports = router;
