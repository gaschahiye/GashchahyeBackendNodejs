const express = require('express');
const authRoutes = require('./auth.routes');
// const buyerRoutes = require('./buyer.routes');
const sellerRoutes = require('./seller.routes');
const driverRoutes = require('./driver.routes');
const adminRoutes = require('./admin.routes');
const docsRoutes = require('./docs.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/buyer', buyerRoutes);
router.use('/seller', sellerRoutes);
router.use('/driver', driverRoutes);
router.use('/admin', adminRoutes);
router.use('/docs', docsRoutes);

module.exports = router;
