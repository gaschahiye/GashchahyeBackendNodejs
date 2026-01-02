// src/routes/seller.route.js

const express = require('express');
const sellerController = require('../controllers/seller.controller');
const sellerPaymentController = require('../controllers/seller.payment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const sellerValidators = require('../validators/seller.validator');

const router = express.Router();

// All routes protected and seller only
router.use(protect);
router.use(authorize('seller'));


/**
 * @swagger
 * /seller/dashboard/stats:
 *   get:
 *     summary: Get seller dashboard statistics
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalInventory:
 *                       type: number
 *                     issuedCylinders:
 *                       type: number
 *                     newOrders:
 *                       type: number
 *                     inProcessOrders:
 *                       type: number
 *                     completedOrders:
 *                       type: number
 *                     returnRequests:
 *                       type: number
 *                     refillRequests:
 *                       type: number
 *                     emptyCylinders:
 *                       type: number
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: number
 *                         thisWeek:
 *                           type: number
 *                         thisMonth:
 *                           type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Seller access only
 */
router.get('/dashboard/stats', sellerController.getDashboardStats);


/**
 * @swagger
 *  /seller/profile:
 *   get:
 *     summary: Get seller profile with stats
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 seller:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     businessName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     sellerStatus:
 *                       type: string
 *                     locations:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Location'
 *                     inventory:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Inventory'
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalOrders:
 *                           type: number
 *                         totalRevenue:
 *                           type: number
 *       404:
 *         description: Seller not found
 */
router.get('/profile', sellerController.getSellerProfile);

/**
 * @swagger
 *  /seller/profile:
 *   patch:
 *     summary: Update seller profile
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 seller:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     businessName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     sellerStatus:
 *                       type: string
 *       400:
 *         description: Phone number or email already in use
 */
router.patch('/profile', validate(sellerValidators.updateProfile), sellerController.updateSellerProfile);

/**
 * @swagger
 * /seller/payments:
 *   get:
 *     summary: Get payment timeline for seller's orders
 *     description: View all payment timeline entries (delivery fees, sales, refunds) for orders from this seller. Returns all entries without pagination.
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by payment status
 *         schema:
 *           type: string
 *           enum: [pending, completed]
 *       - name: type
 *         in: query
 *         description: Filter by payment type
 *         schema:
 *           type: string
 *           enum: [pickup_fee, delivery_fee, refund, sale, other]
 *       - name: dateFrom
 *         in: query
 *         description: Filter by start date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - name: dateTo
 *         in: query
 *         description: Filter by end date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - name: searchQuery
 *         in: query
 *         description: Search by order ID, person name, or phone
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment timeline retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       timelineId:
 *                         type: string
 *                       orderId:
 *                         type: string
 *                       personName:
 *                         type: string
 *                       personType:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       paymentType:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       date:
 *                         type: string
 *                         format: date-time
 *                       notes:
 *                         type: string
 *                       liabilityType:
 *                         type: string
 *                       referenceId:
 *                         type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalPending:
 *                       type: number
 *                     amountToDrivers:
 *                       type: number
 *                     amountToRefund:
 *                       type: number
 *                     clearedAmount:
 *                       type: number
 *                     pendingCount:
 *                       type: number
 *                     clearedCount:
 *                       type: number
 *                     statusDistribution:
 *                       type: object
 *                       properties:
 *                         pending:
 *                           type: number
 *                         completed:
 *                           type: number
 *                 totalEntries:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Seller access only
 */
router.get('/payments', sellerPaymentController.getSellerPaymentTimeline);


/**
 * @swagger
 *  /seller/locations:
 *   post:
 *     summary: Add multiple locations
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locations
 *             properties:
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - warehouseName
 *                     - city
 *                     - address
 *                     - location
 *                   properties:
 *                     warehouseName:
 *                       type: string
 *                       example: "Main Warehouse"
 *                     city:
 *                       type: string
 *                       example: "Karachi"
 *                     address:
 *                       type: string
 *                       example: "Plot #23, Industrial Area"
 *                     location:
 *                       type: object
 *                       properties:
 *                         coordinates:
 *                           type: array
 *                           items:
 *                             type: number
 *                           example: [67.0011, 24.8607]
 *     responses:
 *       201:
 *         description: Locations added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 locations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 *       403:
 *         description: Seller account not approved
 */
router.post('/locations', validate(sellerValidators.addLocation), sellerController.addLocation);

/**
 * @swagger
 *  /seller/locations:
 *   get:
 *     summary: Get seller's locations
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Locations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 locations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 */
router.get('/locations', sellerController.getMyLocations);


/**
 * @swagger
 *  /seller/inventory:
 *   get:
 *     summary: Get seller's inventory
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inventory retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 inventories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Inventory'
 */
router.get('/inventory', sellerController.getInventory);
/**
 * @swagger
 * /seller/update-city-price:
 *   put:
 *     tags:
 *       - Inventory
 *     summary: Update price per kg for all inventories in a city
 *     description: Updates the pricePerKg for all inventory locations belonging to the authenticated seller in a specific city
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - city
 *               - pricePerKg
 *             properties:
 *               city:
 *                 type: string
 *                 description: Name of the city
 *                 example: "Islamabad"
 *               pricePerKg:
 *                 type: number
 *                 format: float
 *                 description: New price per kilogram
 *                 minimum: 0
 *                 example: 150.0
 *     responses:
 *       200:
 *         description: Price updated successfully
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
 *                   example: "Price per kg updated successfully for all inventories in Islamabad"
 *                 city:
 *                   type: string
 *                   example: "Islamabad"
 *                 pricePerKg:
 *                   type: number
 *                   example: 150
 *                 updatedCount:
 *                   type: integer
 *                   description: Number of inventories actually modified
 *                   example: 3
 *                 totalInventories:
 *                   type: integer
 *                   description: Total number of inventories in the city
 *                   example: 3
 *       400:
 *         description: Bad request - Missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "City and pricePerKg are required"
 *       404:
 *         description: No inventories found in the specified city
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No inventories found for city: Islamabad"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Not authorized, token failed"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.put('/update-city-price', sellerController.updateCityPrice);
/**
 * @swagger
 *  /seller/locations/{locationId}:
 *   patch:
 *     summary: Update location
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warehouseName:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               location:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       404:
 *         description: Location not found
 */
router.patch('/locations/:locationId', validate(sellerValidators.updateLocation), sellerController.updateLocation);

/**
 * @swagger
 * /seller/inventory:
 *   post:
 *     summary: Add or update inventory
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - locationid
 *               - location
 *               - city
 *               - pricePerKg
 *               - cylinders
 *             properties:
 *               locationid:
 *                 type: string
 *               location:
 *                 type: string
 *               city:
 *                 type: string
 *               pricePerKg:
 *                 type: number
 *               cylinders:
 *                 type: object
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *               addOns:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     price:
 *                       type: number
 *                     quantity:
 *                       type: number
 *     responses:
 *       200:
 *         description: Inventory created/updated successfully
 *       404:
 *         description: Location not found or unauthorized
 */

router.post('/inventory', validate(sellerValidators.addUpdateInventory), sellerController.addUpdateInventory);


/**
 * @swagger
 *  /seller/inventory/{inventoryId}:
 *   patch:
 *     summary: Update inventory quantity
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: inventoryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cylinders:
 *                 type: object
 *                 additionalProperties:
 *                   type: object
 *                   properties:
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *       404:
 *         description: Inventory not found
 */
router.patch('/inventory/:inventoryId', validate(sellerValidators.updateInventory), sellerController.updateInventoryQuantity);

/**
 * @swagger
 *  /seller/cylinders/map:
 *   get:
 *     summary: Get active cylinders map data
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cylinders data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 cylinders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       size:
 *                         type: string
 *                       buyer:
 *                         type: object
 *                         properties:
 *                           fullName:
 *                             type: string
 *                           phoneNumber:
 *                             type: string
 *                       currentLocation:
 *                         type: object
 *                       serialNumber:
 *                         type: string
 *                       customName:
 *                         type: string
 *                       status:
 *                         type: string
 *                       lastUpdated:
 *                         type: string
 *                         format: date-time
 */
router.get('/cylinders/map', sellerController.getActiveCylindersMap);

/**
 * @swagger
 *  /seller/orders:
 *   get:
 *     summary: Get seller's orders
 *     tags: [Seller]
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
router.get('/orders', sellerController.getOrders);

/**
 * @swagger
 * /seller/orders/{orderId}/ready:
 *   patch:
 *     summary: Mark an order as ready for pickup
 *     description: This endpoint marks a seller's order as ready for pickup.
 *                  It validates inventory availability, assigns cylinders, updates the order status, and returns the assigned cylinder details.
 *     tags:
 *       - Seller
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: The ID of the order to mark as ready
 *         schema:
 *           type: string
 *     requestBody:
 *       description: Additional data for marking the order ready
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warehouseId:
 *                 type: string
 *                 description: The ID of the warehouse from which cylinders will be assigned
 *               notes:
 *                 type: string
 *                 description: Optional notes from the seller regarding the order
 *             required:
 *               - warehouseId
 *     responses:
 *       200:
 *         description: Order marked as ready for pickup successfully
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
 *                   example: Order marked as ready for pickup successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                       description: The MongoDB ID of the order
 *                     warehouse:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           description: Warehouse ID
 *                         name:
 *                           type: string
 *                           description: Warehouse location name
 *                         city:
 *                           type: string
 *                           description: Warehouse city
 *                     issuedCylinders:
 *                       type: integer
 *                       description: Number of cylinders assigned to the order
 *                     cylinderDetails:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           serialNumber:
 *                             type: string
 *                           size:
 *                             type: string
 *                           status:
 *                             type: string
 *                             example: issued
 *       400:
 *         description: Not enough cylinders available or order cannot be marked ready in current status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Not enough filled cylinders available in this warehouse
 *       404:
 *         description: Order or warehouse not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Order not found or unauthorized
 */

router.patch(
    '/orders/:orderId/ready',
    validate(sellerValidators.markReady),
    sellerController.markOrderReadyForPickup
);

/**
 * @swagger
 *  /seller/orders/{orderId}/invoice:
 *   post:
 *     summary: Generate invoice for order
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 invoiceUrl:
 *                   type: string
 *                 invoiceNumber:
 *                   type: string
 *       404:
 *         description: Order not found
 *       400:
 *         description: Cannot generate invoice for unpaid order
 */
router.post('/orders/:orderId/invoice', sellerController.generateInvoice);
/**
 * @swagger
 * /seller/dashboard/warehouse-stats:
 *   post:
 *     summary: Get seller dashboard statistics filtered by a specific warehouse (using locationid)
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warehouseId:
 *                 type: string
 *                 example: "6727a3e2c8b8b1123456789f"
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalInventories:
 *                       type: number
 *                       example: 10
 *                     issuedCylinders:
 *                       type: number
 *                       example: 5
 *                     newOrders:
 *                       type: number
 *                       example: 3
 *                     inProcessOrders:
 *                       type: number
 *                       example: 2
 *                     completedOrders:
 *                       type: number
 *                       example: 7
 *                     returnRequests:
 *                       type: number
 *                       example: 1
 *                     refillRequests:
 *                       type: number
 *                       example: 2
 *                     emptyCylinders:
 *                       type: number
 *                       example: 4
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: number
 *                           example: 500
 *                         thisWeek:
 *                           type: number
 *                           example: 3500
 *                         thisMonth:
 *                           type: number
 *                           example: 15000
 *                     activeCylinders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "6727a3e2c8b8b1123456789f"
 *                           orderId:
 *                             type: string
 *                             example: "ORD12345"
 *                           size:
 *                             type: string
 *                             example: "15kg"
 *                           cylinderSize:
 *                             type: string
 *                             example: "15kg"
 *                           buyer:
 *                             type: object
 *                             description: Buyer details
 *                           currentLocation:
 *                             type: string
 *                             example: "Islamabad"
 *                           serialNumber:
 *                             type: string
 *                             example: "CYL123"
 *                           customName:
 *                             type: string
 *                             example: "Kitchen Gas"
 *                           status:
 *                             type: string
 *                             example: "pickup_ready"
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-11-05T10:30:00Z"
 *                           locationid:
 *                             type: string
 *                             example: "6727a3e2c8b8b1123456789f"
 *                     inventories:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Inventory'
 *       400:
 *         description: locationid missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Seller access only
 */
router.post('/dashboard/warehouse-stats', sellerController.getDashboardStatsByWarehouse);


module.exports = router;