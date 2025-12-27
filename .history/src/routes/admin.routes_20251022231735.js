const express = require('express');
const adminController = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const adminValidators = require('../validators/admin.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management and dashboard APIs
 */

/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@totalaccess.com
 *               password:
 *                 type: string
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Admin login successful"
 *               accessToken: "jwt_token_here"
 *               refreshToken: "refresh_token_here"
 *               admin:
 *                 _id: "64f1a2b345..."
 *                 email: "admin@totalaccess.com"
 *                 fullName: "Super Admin"
 *                 role: "admin"
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(adminValidators.login), adminController.adminLogin);

// Apply protection middleware for all below routes
router.use(protect);
router.use(authorize('admin'));

/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     summary: Get overall system statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats returned successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               stats:
 *                 totalSellers: 100
 *                 activeSellers: 80
 *                 totalDrivers: 45
 *                 totalOrders: 500
 */
router.get('/dashboard/stats', adminController.getDashboardStats);

/**
 * @swagger
 * /admin/sellers:
 *   get:
 *     summary: Get all sellers with optional filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [approved, pending, rejected]
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *           example: "Ali Gas Shop"
 *     responses:
 *       200:
 *         description: List of sellers
 */
router.get('/sellers', adminController.getSellersList);

/**
 * @swagger
 * /admin/sellers/{sellerId}:
 *   get:
 *     summary: Get detailed information for a seller
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sellerId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Seller ID
 *     responses:
 *       200:
 *         description: Seller details fetched successfully
 */
router.get('/sellers/:sellerId', adminController.getSellerDetails);

/**
 * @swagger
 * /admin/sellers/{sellerId}/status:
 *   patch:
 *     summary: Update seller approval status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sellerId
 *         in: path
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
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               notes:
 *                 type: string
 *                 example: "Documents verified successfully."
 *     responses:
 *       200:
 *         description: Seller status updated successfully
 */
router.patch('/sellers/:sellerId/status', validate(adminValidators.updateSellerStatus), adminController.updateSellerStatus);

module.exports = router;
