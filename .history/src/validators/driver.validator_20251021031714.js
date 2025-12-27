const Joi = require('joi');

exports.acceptOrder = Joi.object({
  cylinderPhoto: Joi.string().optional(), // base64 or URL
  tareWeight: Joi.number().min(0).required(),
  netWeight: Joi.number().min(0).required(),
  grossWeight: Joi.number().min(0).required(),
  serialNumber: Joi.string().required(),
  weightDifference: Joi.number().required()
});

exports.scanQRCode = Joi.object({
  qrCode: Joi.string().required()
});

exports.updateLocation = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required()
});

exports.completeDelivery = Joi.object({
  notes: Joi.string().max(500).optional(),
  deliveryPhoto: Joi.string().optional()
});

exports.updateStatus = Joi.object({
  status: Joi.string().valid('available', 'busy', 'offline').required()
});