const Joi = require('joi');

const phoneRegex = /^(\+92|0)?3[0-9]{9}$/;
const cnicRegex = /^[0-9]{5}-[0-9]{7}-[0-9]$/;

exports.registerBuyer = Joi.object({
  phoneNumber: Joi.string().pattern(phoneRegex).required().messages({
    'string.pattern.base': 'Invalid Pakistani phone number format'
  }),
  email: Joi.string().email().optional(),
  password: Joi.string().min(8).required(),
  fullName: Joi.string().min(2).max(100).required(),
  cnic: Joi.string().pattern(cnicRegex).optional().messages({
    'string.pattern.base': 'Invalid CNIC format (XXXXX-XXXXXXX-X)'
  }),
  userType: Joi.string().valid('domestic', 'commercial').required(),
  language: Joi.string().valid('english', 'urdu', 'pashto').default('english')
});

exports.registerSeller = Joi.object({
  businessName: Joi.string().min(2).max(200).required(),
  phoneNumber: Joi.string().pattern(phoneRegex).required(),
  email: Joi.string().email().required(),
  orgaLicenseNumber: Joi.string().required(),
  orgaExpDate: Joi.date().greater('now').required(),
  ntnNumber: Joi.string().required(),
  password: Joi.string().min(8).required()
});

exports.verifyOTP = Joi.object({
  phoneNumber: Joi.string().pattern(phoneRegex).required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required()
});

exports.login = Joi.object({
  phoneNumber: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().required()
});

exports.refreshToken = Joi.object({
  refreshToken: Joi.string().required()
});

exports.resendOTP = Joi.object({
  phoneNumber: Joi.string().pattern(phoneRegex).required()
});