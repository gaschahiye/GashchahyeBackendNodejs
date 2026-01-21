const Joi = require('joi');



exports.addLocation = Joi.object({
  locations: Joi.array().items(
    Joi.object({
      warehouseName: Joi.string().min(2).max(200).required(),
      city: Joi.string().min(2).max(100).required(),
      address: Joi.string().min(5).max(500).required(),
      location: Joi.object({
        coordinates: Joi.array()
          .items(Joi.number())
          .length(2)
          .required()
      }).required()
    })
  ).min(1).required()
});


exports.updateLocation = Joi.object({
  warehouseName: Joi.string().min(2).max(200).optional(),
  city: Joi.string().min(2).max(100).optional(),
  address: Joi.string().min(5).max(500).optional(),
  location: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).optional()
  }).optional(),
  isActive: Joi.boolean().optional()
});

exports.addUpdateInventory = Joi.object({
  location: Joi.string().required(),
  city: Joi.string().min(2).max(100).required(),
  pricePerKg: Joi.number().min(0).required(),
  cylinders: Joi.object({
    '15kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '11.8kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '6kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '4.5kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional()
  }).required(),
  addOns: Joi.array().items(
    Joi.object({
      title: Joi.string().min(2).max(100).required(),
      price: Joi.number().min(0).required(),
      description: Joi.string().max(500).optional(),
      discount: Joi.number().min(0).max(100).default(0),
      quantity: Joi.number().min(0).required()
    })
  ).optional()
});

exports.updateInventory = Joi.object({
  cylinders: Joi.object({
    '15kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '11.8kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '6kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional(),
    '4.5kg': Joi.object({
      quantity: Joi.number().min(0).optional(),
      price: Joi.number().min(0).optional()
    }).optional()
  }).optional()
});

exports.markReady = Joi.object({
  warehouseId: Joi.string().required(),
  notes: Joi.string().max(500).optional()
});

exports.updateProfile = Joi.object({
  businessName: Joi.string().min(2).max(200).optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().pattern(/^(\+92|0)?3[0-9]{9}$/).optional()
});