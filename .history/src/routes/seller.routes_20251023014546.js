// src/routes/seller.route.js

const express = require('express');
const sellerController = require('../controllers/seller.controller');
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
 * /api/seller/generate-test-data:
 *   post:
 *     summary: Generate bulk test data for seller
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Test data generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     locations:
 *                       type: number
 *                     inventories:
 *                       type: number
 *                     cylinders:
 *                       type: number
 *                     orders:
 *                       type: number
 *                     buyers:
 *                       type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     locations:
 *                       type: array
 *                       items:
 *                         type: string
 *                     inventories:
 *                       type: array
 *                       items:
 *                         type: string
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: string
 *       403:
 *         description: Seller account not approved
 *       401:
 *         description: Unauthorized
 */
router.post('/generate-test-data', sellerController.generateBulkTestData);

/**
 * @swagger
 * /api/seller/profile:
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
 * /api/seller/profile:
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
 * /api/seller/locations:
 *   post:
 *     summary: Add new location
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
 *               - warehouseName
 *               - city
 *               - address
 *               - location
 *             properties:
 *               warehouseName:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: number
 *     responses:
 *       201:
 *         description: Location added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 location:
 *                   $ref: '#/components/schemas/Location'
 *       403:
 *         description: Seller account not approved
 */
router.post('/locations', validate(sellerValidators.addLocation), sellerController.addLocation);

/**
 * @swagger
 * /api/seller/locations:
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
 * /api/seller/locations/{locationId}:
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
 * /api/seller/inventory:
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
 *               - location
 *               - city
 *               - pricePerKg
 *               - cylinders
 *             properties:
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
 * /api/seller/inventory:
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
 *       - in: query
 *         name: location
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
 * /api/seller/inventory/{inventoryId}:
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
 * /api/seller/cylinders/map:
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
 * /api/seller/orders:
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
 * /api/seller/orders/{orderId}/ready:
 *   patch:
 *     summary: Mark order as ready for pickup
 *     tags: [Seller]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order marked ready for pickup
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order cannot be marked ready in current status
 */
router.patch('/orders/:orderId/ready', validate(sellerValidators.markReady), sellerController.markOrderReadyForPickup);

/**
 * @swagger
 * /api/seller/orders/{orderId}/invoice:
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

// Swagger Components Schemas
/**
 * @swagger
 * components:
 *   schemas:
 *     Location:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         seller:
 *           type: string
 *         warehouseName:
 *           type: string
 *         city:
 *           type: string
 *         address:
 *           type: string
 *         location:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *             coordinates:
 *               type: array
 *               items:
 *                 type: number
 *         isActive:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     Inventory:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         seller:
 *           type: string
 *         location:
 *           type: string
 *         city:
 *           type: string
 *         pricePerKg:
 *           type: number
 *         cylinders:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *               price:
 *                 type: number
 *         addOns:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               price:
 *                 type: number
 *               quantity:
 *                 type: number
 *         issuedCylinders:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     Order:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         orderId:
 *           type: string
 *         seller:
 *           type: string
 *         buyer:
 *           type: object
 *         driver:
 *           type: object
 *         orderType:
 *           type: string
 *         status:
 *           type: string
 *         cylinderSize:
 *           type: string
 *         existingCylinder:
 *           type: object
 *         inventory:
 *           type: string
 *         deliveryAddress:
 *           type: object
 *         pricing:
 *           type: object
 *         payment:
 *           type: object
 *         statusHistory:
 *           type: array
 *         notes:
 *           type: string
 *         estimatedDelivery:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

module.exports = router;