const express = require('express');
const adminController = require('../controllers/admin.controller');
const adminPaymentController = require('../controllers/admin.payment.controller');
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

// Add this route
/**
 * @swagger
 * /admin/dashboard/widgets:
 *   get:
 *     summary: Get dashboard widgets data (totals, monthly stats, order status)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard widgets data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalSellers:
 *                       type: number
 *                     totalOrders:
 *                       type: number
 *                     totalRevenue:
 *                       type: number
 *                     activeDrivers:
 *                       type: number
 *                     monthlyOrderData:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                           orders:
 *                             type: number
 *                     orderStatusData:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: number
 *                           percentage:
 *                             type: number
 *                     recentNotifications:
 *                       type: array
 */
router.get('/dashboard/widgets', adminController.getDashboardWidgets);

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
router.patch('/sellers/:sellerId/status', adminController.updateSellerStatus);


/**
 * @swagger
 * /admin/drivers/add:
 *   post:
 *     summary: Add a new driver manually
 *     description: Create a new driver account with vehicle details, zone, and CNIC.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - password
 *               - phoneNumber
 *               - vehicleNumber
 *               - zone
 *               - cnic
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Ahmed Khan"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "driverPass123"
 *               phoneNumber:
 *                 type: string
 *                 description: Valid Pakistani phone number
 *                 example: "+923001234567"
 *               vehicleNumber:
 *                 type: string
 *                 example: "LEC-1234"
 *               zone:
 *                 type: string
 *                 description: Operational area/zone
 *                 example: "Gulberg, Lahore"
 *               cnic:
 *                 type: string
 *                 description: Format XXXXX-XXXXXXX-X
 *                 example: "35202-1234567-1"
 *     responses:
 *       201:
 *         description: Driver created successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Driver added successfully"
 *               driver:
 *                 _id: "64f1b..."
 *                 fullName: "Ahmed Khan"
 *                 phoneNumber: "+923001234567"
 *                 vehicleNumber: "LEC-1234"
 *                 zone: "Gulberg, Lahore"
 *                 cnic: "35202-1234567-1"
 *                 driverStatus: "available"
 *       400:
 *         description: Validation error (Duplicate Phone/CNIC/Vehicle)
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "CNIC already registered."
 */

router.post('/drivers/add', adminController.addNewDriver);
/**
 * @swagger
 * /admin/drivers:
 *   get:
 *     summary: Get all drivers with detailed information and statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by active status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *       - name: driverStatus
 *         in: query
 *         description: Filter by driver status
 *         schema:
 *           type: string
 *           enum: [available, busy, offline]
 *       - name: zone
 *         in: query
 *         description: Filter by zone/area
 *         schema:
 *           type: string
 *           example: "Gulberg, Lahore"
 *       - name: search
 *         in: query
 *         description: Search by name, phone, vehicle number, or CNIC
 *         schema:
 *           type: string
 *           example: "Ahmed"
 *       - name: page
 *         in: query
 *         description: Page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: sortBy
 *         in: query
 *         description: Field to sort by
 *         schema:
 *           type: string
 *           enum: [createdAt, fullName, vehicleNumber, zone]
 *           default: createdAt
 *       - name: sortOrder
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of drivers with detailed statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     drivers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                           phoneNumber:
 *                             type: string
 *                           vehicleNumber:
 *                             type: string
 *                           zone:
 *                             type: string
 *                           cnic:
 *                             type: string
 *                           driverStatus:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           stats:
 *                             type: object
 *                             properties:
 *                               totalOrders:
 *                                 type: number
 *                               deliveredOrders:
 *                                 type: number
 *                               currentAssignedOrders:
 *                                 type: number
 *                               deliveryRate:
 *                                 type: number
 *                               averageRating:
 *                                 type: number
 *                               ratingCount:
 *                                 type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         totalDrivers:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 */
router.get('/drivers', adminController.getAllDrivers);

/**
 * @swagger
 * /admin/orders:
 *   get:
 *     summary: Get all orders with comprehensive filtering and statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         description: Filter by order status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in_transit, delivered, completed, cancelled]
 *       - name: paymentStatus
 *         in: query
 *         description: Filter by payment status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed]
 *       - name: sellerId
 *         in: query
 *         description: Filter by seller ID
 *         schema:
 *           type: string
 *       - name: driverId
 *         in: query
 *         description: Filter by driver ID
 *         schema:
 *           type: string
 *       - name: buyerId
 *         in: query
 *         description: Filter by buyer ID
 *         schema:
 *           type: string
 *       - name: dateFrom
 *         in: query
 *         description: Filter orders from date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - name: dateTo
 *         in: query
 *         description: Filter orders to date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *       - name: search
 *         in: query
 *         description: Search by order ID, buyer name, or seller business name
 *         schema:
 *           type: string
 *           example: "ORD-12345"
 *       - name: page
 *         in: query
 *         description: Page number
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: sortBy
 *         in: query
 *         description: Field to sort by
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, 'pricing.grandTotal']
 *           default: createdAt
 *       - name: sortOrder
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of orders with summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           orderId:
 *                             type: string
 *                           buyer:
 *                             type: object
 *                           seller:
 *                             type: object
 *                           driver:
 *                             type: object
 *                           status:
 *                             type: string
 *                           payment:
 *                             type: object
 *                           pricing:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           orderAge:
 *                             type: number
 *                             description: Age of order in days
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalOrders:
 *                           type: number
 *                         totalRevenue:
 *                           type: number
 *                         completedRevenue:
 *                           type: number
 *                         pendingRevenue:
 *                           type: number
 *                         avgOrderValue:
 *                           type: number
 *                     statusDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         totalOrders:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 */
router.get('/orders', adminController.getAllOrders);

// ... export router


// Multer for file uploads (Memory storage for processing Excel in buffer)
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * @swagger
 * /admin/payments:
 *   get:
 *     summary: Get payment timeline and admin revenue
 *     description: Retrieve a paginated list of all payment timeline entries (sales, delivery fees, refunds) with flattened details. Includes statistical summary.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *         description: Page number for pagination
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20 }
 *         description: Number of items per page
 *       - name: dateFrom
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Filter by start date (YYYY-MM-DD)
 *       - name: dateTo
 *         in: query
 *         schema: { type: string, format: date }
 *         description: Filter by end date (YYYY-MM-DD)
 *       - name: driverId
 *         in: query
 *         schema: { type: string }
 *         description: Filter by Driver ID
 *       - name: type
 *         in: query
 *         schema: { type: string, enum: [pickup_fee, delivery_fee, refund, sale, other, seller_payment, partial_refund] }
 *         description: Filter by payment type
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [pending, completed, failed] }
 *         description: Filter by payment status
 *       - name: searchQuery
 *         in: query
 *         schema: { type: string }
 *         description: Search by Order ID, Person Name, or Phone
 *     responses:
 *       200:
 *         description: Successful response with payment data and statistics
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
 *                       id: { type: string }
 *                       orderId: { type: string }
 *                       personName: { type: string }
 *                       personType: { type: string }
 *                       phone: { type: string }
 *                       paymentType: { type: string }
 *                       amount: { type: number }
 *                       status: { type: string }
 *                       date: { type: string, format: date-time }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalPending: { type: number }
 *                     amountToSellers: { type: number }
 *                     amountToRefund: { type: number }
 *                     clearedAmount: { type: number }
 *                     pendingCount: { type: number }
 *                     clearedCount: { type: number }
 *                     refundAmount: { type: number }
 *                     totalAmount: { type: number }
 *                     companyRevenue: { type: number }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage: { type: integer }
 *                     totalPages: { type: integer }
 *                     totalEntries: { type: integer }
 */

router.get('/payments', adminPaymentController.getPaymentTimeline);


/**
 * @swagger
 * /admin/payments/{timelineId}/clear:
 *   post:
 *     summary: Clear a specific payment
 *     description: Manually mark a pending payment entry as completed. Can optionally add a reference ID and notes.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: timelineId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         description: The unique ID of the timeline entry (not the MongoDB _id, but the timelineId string)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               referenceId:
 *                 type: string
 *                 description: External reference/transaction ID
 *               notes:
 *                 type: string
 *                 description: Remarks or notes for clearing
 *     responses:
 *       200:
 *         description: Payment cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 payment: { type: object }
 *       404:
 *         description: Payment entry not found
 *       400:
 *         description: Payment already cleared
 */
router.post('/payments/:timelineId/clear', adminPaymentController.clearPayment);

/**
 * @swagger
 * /admin/payments/export:
 *   get:
 *     summary: Export pending payments to Excel
 *     description: Downloads an .xlsx file containing all pending payment entries. Useful for bulk processing.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/payments/export', adminPaymentController.exportPayments);

/**
 * @swagger
 * /admin/payments/import:
 *   post:
 *     summary: Bulk clear payments via Excel import
 *     description: Upload an .xlsx file (same format as export) to bulk update payment statuses to 'completed'. Matches by 'ID'.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The Excel file to upload
 *     responses:
 *       200:
 *         description: Bulk processing result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 */
router.post('/payments/import', upload.single('file'), adminPaymentController.importPayments);

/**
 * @swagger
 * /admin/payments/rebuild-sheet:
 *   post:
 *     summary: Completely rebuild Google Sheet from Database
 *     description: Wipes the Google Sheet and re-uploads all payment history. Use this if the sheet gets corrupted or out of sync.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rebuild successful
 */
router.post('/payments/rebuild-sheet', adminPaymentController.rebuildSheet);

/**
 * @swagger
 * /admin/payments/sync:
 *   post:
 *     summary: Sync payments from Google Sheet
 *     description: Pulls latest statuses from the configured Google Sheet and updates the database.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/payments/sync', adminPaymentController.syncGoogleSheet);

/**
 * @swagger
 * /admin/payments/sync-webhook:
 *   post:
 *     summary: Webhook for Google Sheets automatic sync (Internal)
 *     description: Receives updates from Google Apps Script when a row is edited.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync successful
 */
router.post('/payments/sync-webhook', adminPaymentController.syncGoogleSheetWebhook);


module.exports = router;
