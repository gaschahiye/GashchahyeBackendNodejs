const express = require('express');
const driverController = require('../controllers/driver.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const driverValidators = require('../validators/driver.validator');
const { uploadSingle } = require('../middleware/upload.middleware');

const router = express.Router();

// All routes protected and driver only
router.use(protect);
router.use(authorize('driver'));

// Dashboard
router.get('/dashboard', driverController.getDriverDashboard);

// Orders
router.get('/orders', driverController.getAssignedOrders);
router.post('/orders/:orderId/accept', validate(driverValidators.acceptOrder), driverController.acceptOrder);
router.post('/orders/:orderId/generate-qr', driverController.generateQRCode);
router.post('/orders/:orderId/print-qr', driverController.printQRCode);
router.post('/orders/:orderId/scan-qr', validate(driverValidators.scanQRCode), driverController.scanQRCode);
router.post('/orders/:orderId/complete', validate(driverValidators.completeDelivery), driverController.completeDelivery);

// Location & Status
router.post('/location', validate(driverValidators.updateLocation), driverController.updateLocation);
router.patch('/status', validate(driverValidators.updateStatus), driverController.updateDriverStatus);

module.exports = router;