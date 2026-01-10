const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const authValidators = require('../validators/auth.validator');
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const driverController = require('../controllers/driver.controller');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and authorization APIs
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new buyer
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - email
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               fullName:
 *                 type: string
 *               cnic:
 *                 type: string
 *               userType:
 *                 type: domestic | commercial
 *               language:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration successful, OTP sent
 *       400:
 *         description: User already exists
 */
router.post('/register', validate(authValidators.registerBuyer), authController.registerBuyer);

/**
 * @swagger
 * /auth/register-seller:
 *   post:
 *     summary: Register a new seller
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber

 *               - businessName
 *               - orgaLicenseNumber
 *               - orgaExpDate
 *               - ntnNumber
 *               - orgaLicenseFile
 *             properties:
 *               businessName:
 *                 type: string
 *                 example: "Bright Gas Distributors"
 *               phoneNumber:
 *                 type: string
 *                 example: "03123456789"

 *               orgaLicenseNumber:
 *                 type: string
 *                 example: "LIC-987654"
 *               orgaExpDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-31"
 *               ntnNumber:
 *                 type: string
 *                 example: "1234567-8"
 *               currentLocation:
 *                 type: string
 *                 example: '{"type":"Point","coordinates":[73.0479,33.6844]}'
 *               orgaLicenseFile:
 *                 type: string
 *                 format: binary
 *                 description: Organization license image file
 *     responses:
 *       201:
 *         description: Seller registration successful
 *       400:
 *         description: User already exists
 *       500:
 *         description: Internal server error
 */

router.post(
    '/register-seller',
    upload.single('orgaLicenseFile'),
    validate(authValidators.registerSeller),
    authController.registerSeller
);


/**
 * @swagger
 *  /auth/verify-otp:
 *   post:
 *     summary: Verify OTP for user activation
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 */
router.post('/verify-otp', validate(authValidators.verifyOTP), authController.verifyOTP);

/**
 * @swagger
 *  /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(authValidators.login), authController.login);

/**
 * @swagger
 *  /auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 *       401:
 *         description: Invalid or missing token
 */
router.post('/refresh-token', validate(authValidators.refreshToken), authController.refreshToken);

/**
 * @swagger
 *  /auth/resend-otp:
 *   post:
 *     summary: Resend OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP resent successfully
 */
router.post('/resend-otp', validate(authValidators.resendOTP), authController.resendOTP);

/**
 * @swagger
 *  /auth/logout:
 *   post:
 *     summary: Logout current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', authController.logout);
/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current logged-in user details
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns user details of the authenticated user
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
 *                   example: User profile fetched successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     role:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     sellerStatus:
 *                       type: string
 *                     businessName:
 *                       type: string
 *       401:
 *         description: Unauthorized or invalid token
 *       404:
 *         description: User not found
 */
router.get('/me', authController.me);

/**
 * @swagger
 * /auth/Driver-login:
 *   post:
 *     summary: Driver login
 *     description: Authenticate driver using phone number and password provided by admin.
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - password
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+923001234567"
 *               password:
 *                 type: string
 *                 example: "driver@123"
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Login successful"
 *               accessToken: "eyJhbGciOiJIUzI1..."
 *               refreshToken: "eyJhbGciOiJIUzI1..."
 *               driver:
 *                 _id: "64f1b..."
 *                 fullName: "Ahmed Khan"
 *                 phoneNumber: "+923001234567"
 *                 driverStatus: "available"
 *       401:
 *         description: Invalid credentials or account deactivated
 */
router.post('/Driver-login', driverController.login);
/**
 * @swagger
 * /auth/driverMe:
 *   get:
 *     summary: Get currently authenticated driver details
 *     description: Fetches the profile and status of the driver corresponding to the JWT token.
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns the driver's details
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               driver:
 *                 _id: "64f1a2b345..."
 *                 fullName: "Ahmed Khan"
 *                 phoneNumber: "+923001234567"
 *                 role: "driver"
 *                 driverStatus: "available"
 *                 zone: "Gulberg"
 *                 vehicleNumber: "LEC-1234"
 *                 isActive: true
 *                 isVerified: true
 *       401:
 *         description: Unauthorized, invalid or missing token
 */
router.get('/driverMe', driverController.getMe);

/**
 * @swagger
 * /auth/drivers/reset-password:
 *   patch:
 *     summary: Reset a driver's password
 *     description: Admin can reset a driver's password using their phone number.
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - newPassword
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "03001234567"
 *                 description: Driver's registered phone number
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: "NewStrongPassword123"
 *     responses:
 *       200:
 *         description: Driver password reset successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Driver password reset successfully"
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Driver not found
 */

router.patch('/drivers/reset-password', adminController.resetDriverPassword);
module.exports = router;
// password:
//     type: string
// example: "StrongPassword123"
// - password