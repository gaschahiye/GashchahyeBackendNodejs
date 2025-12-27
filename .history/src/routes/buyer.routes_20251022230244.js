const express = require('express');
const buyerController = require('../controllers/buyer.controller');
const auth = require('../middlewares/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Buyer
 *   description: Buyer-related operations and order management
 */

/**
 * @swagger
 * /api/buyers/address:
 *   post:
 *     summary: Add a new address for the authenticated buyer
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *               - address
 *               - location
 *             properties:
 *               label:
 *                 type: string
 *                 example: Home
 *               address:
 *                 type: string
 *                 example: House #12, Street 5, Lahore
 *               location:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *                     example: [74.3587, 31.5204]
 *               isDefault:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Address added successfully
 */
router.post('/address', auth.authenticate, buyerController.addAddress);

/**
 * @swagger
 * /api/buyers/nearby-sellers:
 *   get:
 *     summary: Get nearby sellers based on buyer's location
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: lat
 *         in: query
 *         description: Latitude of buyer
 *         required: true
 *         schema:
 *           type: number
 *           example: 31.5204
 *       - name: lng
 *         in: query
 *         description: Longitude of buyer
 *         required: true
 *         schema:
 *           type: number
 *           example: 74.3587
 *       - name: radius
 *         in: query
 *         description: Search radius in meters (default 5000)
 *         schema:
 *           type: number
 *           example: 5000
 *       - name: sortBy
 *         in: query
 *         description: Sort by 'distance', 'rating', 'price_low', or 'price_high'
 *         schema:
 *           type: string
 *           example: distance
 *     responses:
 *       200:
 *         description: List of nearby sellers
 */
router.get('/nearby-sellers', auth.authenticate, buyerController.getNearbySellers);

/**
 * @swagger
 * /api/buyers/orders:
 *   post:
 *     summary: Create a new gas cylinder order
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seller
 *               - orderType
 *               - cylinderSize
 *               - quantity
 *               - deliveryLocation
 *               - payment
 *             properties:
 *               seller:
 *                 type: string
 *                 example: 66c5df08c17e8a2e4fb3f7d9
 *               orderType:
 *                 type: string
 *                 example: new
 *               cylinderSize:
 *                 type: string
 *                 example: 12kg
 *               quantity:
 *                 type: number
 *                 example: 2
 *               isUrgent:
 *                 type: boolean
 *                 example: false
 *               deliveryLocation:
 *                 type: object
 *                 properties:
 *                   address:
 *                     type: string
 *                     example: House #10, DHA Phase 3, Lahore
 *                   location:
 *                     type: object
 *                     properties:
 *                       coordinates:
 *                         type: array
 *                         items:
 *                           type: number
 *                         example: [74.3587, 31.5204]
 *               addOns:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *                     quantity:
 *                       type: number
 *               payment:
 *                 type: object
 *                 required:
 *                   - method
 *                 properties:
 *                   method:
 *                     type: string
 *                     enum: [jazzcash, easypaisa, cod]
 *                     example: cod
 *     responses:
 *       201:
 *         description: Order created successfully
 */
router.post('/orders', auth.authenticate, buyerController.createOrder);

/**
 * @swagger
 * /api/buyers/cylinders:
 *   get:
 *     summary: Get all cylinders associated with the buyer
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter cylinders by status (optional)
 *         schema:
 *           type: string
 *           example: active
 *     responses:
 *       200:
 *         description: List of buyer cylinders
 */
router.get('/cylinders', auth.authenticate, buyerController.getMyCylinders);

/**
 * @swagger
 * /api/buyers/refill:
 *   post:
 *     summary: Request a refill for an existing cylinder
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cylinderId
 *             properties:
 *               cylinderId:
 *                 type: string
 *                 example: 66c5df08c17e8a2e4fb3f7d9
 *               newSize:
 *                 type: string
 *                 example: 15kg
 *     responses:
 *       200:
 *         description: Refill request submitted successfully
 */
router.post('/refill', auth.authenticate, buyerController.requestRefill);

/**
 * @swagger
 * /api/buyers/scan-qrcode:
 *   post:
 *     summary: Scan QR code to confirm delivery
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
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
 *                 example: QRCODE123456
 *     responses:
 *       200:
 *         description: Delivery confirmed successfully
 */
router.post('/scan-qrcode', auth.authenticate, buyerController.scanQRCode);

module.exports = router;
