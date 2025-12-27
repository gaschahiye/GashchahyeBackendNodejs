const express = require('express');
const buyerController = require('../controllers/buyer.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();
router.use(protect);
router.use(authorize('buyer'));
/**
 * @swagger
 * tags:
 *   name: Buyer
 *   description: Buyer-related operations and order management
 */

/**
 * @swagger
 * /buyer/address:
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
router.post('/address', buyerController.addAddress);

/**
 * @swagger
 *  /buyer/nearby-sellers:
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
router.get('/nearby-sellers',  buyerController.getNearbySellers);

/**
 * @swagger
 * /buyer/orders:
 *   post:
 *     summary: Create a new gas cylinder order (linked to specific warehouse)
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
 *               - locationid
 *               - orderType
 *               - cylinderSize
 *               - quantity
 *               - deliveryLocation
 *               - payment
 *             properties:
 *               seller:
 *                 type: string
 *                 description: Seller ID
 *                 example: 66c5df08c17e8a2e4fb3f7d9
 *               locationid:
 *                 type: string
 *                 description: Warehouse/Location ID to identify which inventory to use
 *                 example: 6712abc1234ef56789abcd01
 *               orderType:
 *                 type: string
 *                 description: Type of order (new, refill, return)
 *                 example: new
 *               cylinderSize:
 *                 type: string
 *                 description: Size of the cylinder ordered
 *                 example: 12kg
 *               quantity:
 *                 type: number
 *                 description: Number of cylinders ordered
 *                 example: 2
 *               isUrgent:
 *                 type: boolean
 *                 description: Whether urgent delivery is required (affects delivery charges)
 *                 example: false
 *               deliveryLocation:
 *                 type: object
 *                 description: Delivery address and coordinates
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
 *                 description: Optional add-on items
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: Gas Regulator
 *                     price:
 *                       type: number
 *                       example: 500
 *                     quantity:
 *                       type: number
 *                       example: 1
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Order created successfully
 *                 order:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 672fbe6a90d9eabdf0564f2c
 *                     buyer:
 *                       type: string
 *                       example: 66d4cd60a1b2c3e4f5a67890
 *                     seller:
 *                       type: string
 *                       example: 66c5df08c17e8a2e4fb3f7d9
 *                     warehouse:
 *                       type: string
 *                       description: Linked inventory ID
 *                       example: 6712abc1234ef56789abcd01
 *                     orderType:
 *                       type: string
 *                       example: new
 *                     cylinderSize:
 *                       type: string
 *                       example: 12kg
 *                     quantity:
 *                       type: number
 *                       example: 2
 *                     pricing:
 *                       type: object
 *                       properties:
 *                         cylinderPrice:
 *                           type: number
 *                           example: 4000
 *                         addOnsTotal:
 *                           type: number
 *                           example: 500
 *                         grandTotal:
 *                           type: number
 *                           example: 4600
 *                     status:
 *                       type: string
 *                       example: pending
 */
router.post('/orders', buyerController.createOrder);


/**
 * @swagger
 *  /buyer/cylinders:
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
router.get('/cylinders',  buyerController.getMyCylinders);

/**
 * @swagger
 *  /buyer/refill:
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
router.post('/refill',  buyerController.requestRefill);

/**
 * @swagger
 *  /buyer/scan-qrcode:
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
router.post('/scan-qrcode',  buyerController.scanQRCode);

/**
 * @swagger
 *  /buyer/cylinders/{id}/name:
 *   put:
 *     summary: Update the custom name of a cylinder
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the cylinder
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customName
 *             properties:
 *               customName:
 *                 type: string
 *                 example: My Blue LPG Cylinder
 *     responses:
 *       200:
 *         description: Cylinder name updated successfully
 *       400:
 *         description: Missing or invalid fields
 *       403:
 *         description: User not authorized to update this cylinder
 *       404:
 *         description: Cylinder not found
 */
router.put('/cylinders/:id/name',  buyerController.updateCylinderName);


/**
 * @swagger
 *  /buyer/orders:
 *   get:
 *     summary: Get buyer's orders
 *     tags: [Buyer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *                     totalOrders:
 *                       type: number
 */
router.get('/orders', buyerController.getOrders);

/**
 * @swagger
 * /buyer/request-return-and-rate:
 *   post:
 *     summary: Request cylinder return AND submit rating in one action
 *     description: This endpoint allows the buyer to request a return for an empty cylinder and immediately submit a rating for the seller. The API handles return request, driver auto-assignment, cylinder status update, and rating creation in a single transaction.
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
 *               - stars
 *               - type
 *             properties:
 *               cylinderId:
 *                 type: string
 *                 example: "671a76e9bf23d9ca86fb124f"
 *               stars:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               description:
 *                 type: string
 *                 example: "Return process was smooth and professional."
 *               type:
 *                 type: string
 *                 enum: [delivery, return, refill]
 *                 example: "return"
 *     responses:
 *       200:
 *         description: Return requested + rating submitted successfully
 *       400:
 *         description: Validation error or duplicate rating
 *       403:
 *         description: User not allowed to perform this action
 *       404:
 *         description: Cylinder or order not found
 */
router.post(
    "/request-return-and-rate",
    buyerController.requestReturnAndRate
);


module.exports = router;
