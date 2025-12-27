const express = require('express');
const driverController = require('../controllers/driver.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const driverValidators = require('../validators/driver.validator');
const { uploadSingle } = require('../middleware/upload.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Endpoints for driver operations, delivery management, and order handling
 */

router.use(protect);
router.use(authorize('driver'));

/**
 * @swagger
 * /driver/dashboard:
 *   get:
 *     summary: Get driver dashboard stats
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns order counts and today's orders
 */
router.get('/dashboard', driverController.getDriverDashboard);

/**
 * @swagger
 *  /driver/orders:
 *   get:
 *     summary: Get assigned orders for the authenticated driver
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by order status (e.g. assigned, in_transit)
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Paginated list of orders assigned to the driver
 */
router.get('/orders', driverController.getAssignedOrders);

/**
 * @swagger
 *  /driver/orders/{orderId}/accept:
 *   post:
 *     summary: Accept and verify a new order
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tareWeight
 *               - netWeight
 *               - grossWeight
 *               - serialNumber
 *             properties:
 *               cylinderPhoto:
 *                 type: string
 *                 description: Base64 encoded image
 *               tareWeight:
 *                 type: number
 *                 example: 13.5
 *               netWeight:
 *                 type: number
 *                 example: 12
 *               grossWeight:
 *                 type: number
 *                 example: 25.5
 *               serialNumber:
 *                 type: string
 *                 example: CYL-2025-9876
 *               weightDifference:
 *                 type: number
 *                 example: 0.2
 *     responses:
 *       200:
 *         description: Order accepted successfully
 */
router.post('/orders/:orderId/accept', validate(driverValidators.acceptOrder), driverController.acceptOrder);

/**
 * @swagger
 *  /driver/orders/{orderId}/generate-qr:
 *   post:
 *     summary: Generate a QR code for the assigned order
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     responses:
 *       200:
 *         description: QR code generated successfully
 */
router.post('/orders/:orderId/generate-qr', driverController.generateQRCode);

/**
 * @swagger
 *  /driver/orders/{orderId}/print-qr:
 *   post:
 *     summary: Mark a QR code as printed
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     responses:
 *       200:
 *         description: QR code marked as printed
 */
router.post('/orders/:orderId/print-qr', driverController.printQRCode);

/**
 * @swagger
 *  /driver/orders/{orderId}/scan-qr:
 *   post:
 *     summary: Scan and verify a QR code for order pickup or delivery
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qrCode
 *             properties:
 *               qrCode:
 *                 type: string
 *                 example: QRCODE-987654321
 *     responses:
 *       200:
 *         description: Order status updated successfully after QR scan
 */
router.post('/orders/:orderId/scan-qr', validate(driverValidators.scanQRCode), driverController.scanQRCode);

/**
 * @swagger
 *  /driver/orders/{orderId}/Delivery-scan-qr:
 *   post:
 *     summary: Scan and verify a QR code for ConfirmDelivert
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qrCode
 *             properties:
 *               qrCode:
 *                 type: string
 *                 example: QRCODE-987654321
 *     responses:
 *       200:
 *         description: Order status updated successfully after QR scan
 */
router.post('/orders/:orderId/Delivery-scan-qr', validate(driverValidators.scanQRCode), driverController.scanQRCodeForDelivery);

/**
 * @swagger
 *  /driver/orders/{orderId}/complete:
 *   post:
 *     summary: Mark an order as delivered
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: 66e123f4a7bcf9a12b33d9f1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: Delivered at main gate, confirmed with buyer
 *               deliveryPhoto:
 *                 type: string
 *                 description: Base64 encoded image of delivery
 *     responses:
 *       200:
 *         description: Delivery completed successfully
 */
router.post('/orders/:orderId/complete', validate(driverValidators.completeDelivery), driverController.completeDelivery);

/**
 * @swagger
 *  /driver/location:
 *   post:
 *     summary: Update driver’s real-time location
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 example: 31.5204
 *               longitude:
 *                 type: number
 *                 example: 74.3587
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.post('/location', validate(driverValidators.updateLocation), driverController.updateLocation);

/**
 * @swagger
 *  /driver/status:
 *   patch:
 *     summary: Update driver’s availability status
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [available, busy, offline]
 *                 example: available
 *     responses:
 *       200:
 *         description: Driver status updated successfully
 */
router.patch('/status', validate(driverValidators.updateStatus), driverController.updateDriverStatus);




module.exports = router;
