const mongoose = require('mongoose');

const cylinderSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: false
  },
  customName: {
    type: String,
    trim: true,
    default: function () {
      return `Cylinder ${this.size}`;
    }
  },

  SellerName: {
    type: String,
    required: false,
  },

  securityFee: {
    type: Number,
    required: false,
  },

  size: {
    type: String,
    enum: ['15kg', '11.8kg', '6kg', '4.5kg'],
    required: true
  },
  serialNumber: {
    type: String,
    required: true,
    unique: true
  },
  qrCode: {
    type: String,
    required: true,
    unique: true
  },
  weights: {
    tareWeight: {
      type: Number,
      required: true,
      min: 0
    },
    netWeight: {
      type: Number,
      required: true,
      min: 0
    },
    grossWeight: {
      type: Number,
      required: true,
      min: 0
    },
    weightDifference: {
      type: Number,
      required: true
    }
  },
  cylinderPhoto: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'empty', 'in_refill', 'returned', 'refill_return'],
    default: 'active'
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: undefined
    },
    coordinates: {
      type: [Number],
      default: undefined
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

cylinderSchema.index({ buyer: 1, status: 1 });
cylinderSchema.index({ seller: 1 });
cylinderSchema.index({ qrCode: 1 });
cylinderSchema.index({ serialNumber: 1 });
cylinderSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('Cylinder', cylinderSchema);