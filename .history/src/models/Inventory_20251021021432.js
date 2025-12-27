const mongoose = require('mongoose');

const addOnSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  quantity: { type: Number, required: true, min: 0 }
});

const inventorySchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  city: {
    type: String,
    required: true
  },
  pricePerKg: {
    type: Number,
    required: true,
    min: 0
  },
  cylinders: {
    '15kg': {
      quantity: { type: Number, required: true, min: 0, default: 0 },
      price: { type: Number, required: true, min: 0 }
    },
    '11.8kg': {
      quantity: { type: Number, required: true, min: 0, default: 0 },
      price: { type: Number, required: true, min: 0 }
    },
    '6kg': {
      quantity: { type: Number, required: true, min: 0, default: 0 },
      price: { type: Number, required: true, min: 0 }
    },
    '4.5kg': {
      quantity: { type: Number, required: true, min: 0, default: 0 },
      price: { type: Number, required: true, min: 0 }
    }
  },
  addOns: [addOnSchema],
  totalInventory: { type: Number, default: 0 },
  issuedCylinders: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

inventorySchema.pre('save', function(next) {
  this.totalInventory = 
    this.cylinders['15kg'].quantity +
    this.cylinders['11.8kg'].quantity +
    this.cylinders['6kg'].quantity +
    this.cylinders['4.5kg'].quantity;
  next();
});

inventorySchema.index({ seller: 1, location: 1 });
inventorySchema.index({ seller: 1, city: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);