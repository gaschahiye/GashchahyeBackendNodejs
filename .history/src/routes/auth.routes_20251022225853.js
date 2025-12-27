const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const authValidators = require('../validators/auth.validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and authorization APIs
 */

/**
 * @swagger
 * /api/auth/register:
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
 *                 type: string
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
 * /api/auth/register-seller:
 *   post:
 *     summary: Register a new seller
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
 *               - businessName
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               businessName:
 *                 type: string
 *               orgaLicenseNumber:
 *                 type: string
 *               orgaExpDate:
 *                 type: string
 *                 format: date
 *               ntnNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Seller registration successful
 */
router.post('/register-seller', validate(authValidators.registerSeller), authController.registerSeller);

/**
 * @swagger
 * /api/auth/verify-otp:
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
 * /api/auth/login:
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
 * /api/auth/refresh-token:
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
 * /api/auth/resend-otp:
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
 * /api/auth/logout:
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

module.exports = router;
