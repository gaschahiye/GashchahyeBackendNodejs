const mongoose = require('mongoose');

const addOnSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    trim: true
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  }
});

const inventorySchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  locationid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  location: {
    type: String,
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

  isRefund:{
    type: Boolean,
    default: true,
  },
  // ✅ Use Mixed type to support any string keys including dots
  cylinders: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      '15kg': { quantity: 0, price: 0 },
      '11.8kg': { quantity: 0, price: 0 },
      '6kg': { quantity: 0, price: 0 },
      '4.5kg': { quantity: 0, price: 0 }
    }
  },
  addOns: [addOnSchema],
  totalInventory: {
    type: Number,
    default: 0
  },
  issuedCylinders: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// ✅ Updated pre-save calculation for totalInventory
inventorySchema.pre('save', function (next) {
  const cylinders = this.cylinders || {};
  let total = 0;

  // Sum up all cylinder quantities
  Object.keys(cylinders).forEach(size => {
    total += cylinders[size]?.quantity || 0;
  });

  this.totalInventory = total;
  next();
});

// ✅ Indexes for performance
inventorySchema.index({ seller: 1, location: 1 });
inventorySchema.index({ seller: 1, city: 1 });
inventorySchema.index({ location: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);