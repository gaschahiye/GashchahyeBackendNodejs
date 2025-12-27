const express = require('express');
const adminController = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const adminValidators = require('../validators/admin.validator');

const router = express.Router();

// All routes protected and admin only
router.use(protect);
router.use(authorize('admin'));

// Auth
router.post('/login', validate(adminValidators.login), adminController.adminLogin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);

// Sellers Management
router.get('/sellers', adminController.getSellersList);
router.get('/sellers/:sellerId', adminController.getSellerDetails);
router.patch('/sellers/:sellerId/status', validate(adminValidators.updateSellerStatus), adminController.updateSellerStatus);

// Drivers Management
router.get('/drivers', adminController.getDriversList);
router.post('/drivers', validate(adminValidators.createDriver), adminController.createDriver);
router.patch('/drivers/:driverId', validate(adminValidators.updateDriver), adminController.updateDriver);

// Orders Management
router.get('/orders', adminController.getOrdersOverview);
router.post('/orders/:orderId/assign-driver', validate(adminValidators.assignDriver), adminController.assignDriverToOrder);

module.exports = router;