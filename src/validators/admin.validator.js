const Joi = require('joi');

exports.login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

exports.updateSellerStatus = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  notes: Joi.string().max(500).optional()
});

exports.createDriver = Joi.object({
  fullName: Joi.string().min(2).max(100).required(),
  phoneNumber: Joi.string().pattern(/^(\+92|0)?3[0-9]{9}$/).required(),
  password: Joi.string().min(6).required(),
  vehicleNumber: Joi.string().required(),
  zone: Joi.string().required(),
  autoAssignOrders: Joi.boolean().default(false)
});

exports.updateDriver = Joi.object({
  fullName: Joi.string().min(2).max(100).optional(),
  vehicleNumber: Joi.string().optional(),
  zone: Joi.string().optional(),
  autoAssignOrders: Joi.boolean().optional(),
  driverStatus: Joi.string().valid('available', 'busy', 'offline').optional(),
  isActive: Joi.boolean().optional()
});

exports.assignDriver = Joi.object({
  driverId: Joi.string().required()
});