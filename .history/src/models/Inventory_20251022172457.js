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
      quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
    },
    '11.8kg': {
      quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
    },
    '6kg': {
      quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
    },
    '4.5kg': {
      quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
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

// ✅ Safe pre-save calculation for totalInventory
inventorySchema.pre('save', function (next) {
  const cylinders = this.cylinders || {};
  const weights = ['15kg', '11.8kg', '6kg', '4.5kg'];

  this.totalInventory = weights.reduce((sum, w) => {
    const cyl = cylinders[w] || {};
    return sum + (cyl.quantity || 0);
  }, 0);

  next();
});

// ✅ Indexes for performance
inventorySchema.index({ seller: 1, location: 1 });
inventorySchema.index({ seller: 1, city: 1 });
inventorySchema.index({ location: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);
