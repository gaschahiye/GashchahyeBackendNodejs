const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const authValidators = require('../validators/auth.validator');

const router = express.Router();

 router.post('/register', validate(authValidators.registerBuyer), authController.registerBuyer);
router.post('/register-seller', validate(authValidators.registerSeller), authController.registerSeller);
router.post('/verify-otp', validate(authValidators.verifyOTP), authController.verifyOTP);
router.post('/login', validate(authValidators.login), authController.login);
router.post('/refresh-token', validate(authValidators.refreshToken), authController.refreshToken);
router.post('/resend-otp', validate(authValidators.resendOTP), authController.resendOTP);
router.post('/logout', authController.logout);

module.exports = router;