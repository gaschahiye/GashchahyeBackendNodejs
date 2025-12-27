const express = require('express');
const sellerController = require('../controllers/seller.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const sellerValidators = require('../validators/seller.validator');

const router = express.Router();

// All routes protected and seller only
router.use(protect);
router.use(authorize('seller'));

// Dashboard
router.get('/dashboard/stats', sellerController.getDashboardStats);
router.post('/generate-test-data', sellerController.generateBulkTestData);
// Profile
router.get('/profile', sellerController.getSellerProfile);
router.patch('/profile', validate(sellerValidators.updateProfile), sellerController.updateSellerProfile);

// Locations Management
router.post('/locations', validate(sellerValidators.addLocation), sellerController.addLocation);
router.get('/locations', sellerController.getMyLocations);
router.patch('/locations/:locationId', validate(sellerValidators.updateLocation), sellerController.updateLocation);

// Inventory Management
router.post('/inventory', validate(sellerValidators.addUpdateInventory), sellerController.addUpdateInventory);
router.get('/inventory', sellerController.getInventory);
router.patch('/inventory/:inventoryId', validate(sellerValidators.updateInventory), sellerController.updateInventoryQuantity);

// Cylinders Management
router.get('/cylinders/map', sellerController.getActiveCylindersMap);

// Orders Management
router.get('/orders', sellerController.getOrders);
router.patch('/orders/:orderId/ready', validate(sellerValidators.markReady), sellerController.markOrderReadyForPickup);
router.post('/orders/:orderId/invoice', sellerController.generateInvoice);

module.exports = router;