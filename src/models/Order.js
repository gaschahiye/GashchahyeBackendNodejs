const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  orderType: {
    type: String,
    enum: ['new', 'refill', 'return', 'supplier_change'],
    required: true
  },
  cylinderSize: {
    type: String,
    enum: ['15kg', '11.8kg', '6kg', '4.5kg'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  existingCylinder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cylinder'
  },
  pickupLocation: {
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    }
  },
  deliveryLocation: {
    address: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    }
  },
  pricing: {
    cylinderPrice: {
      type: Number,
      required: true,
      min: 0
    },
    securityCharges: {
      type: Number,
      default: 0,
      min: 0
    },
    deliveryCharges: {
      type: Number,
      required: true,
      min: 0
    },
    urgentDeliveryFee: {
      type: Number,
      default: 0,
      min: 0
    },
    addOnsTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  addOns: [{
    title: String,
    price: Number,
    quantity: Number
  }],
  status: {
    type: String,
    enum: [
      'pending', 'accepted','assigned','qrgenerated', 'pickup_ready', 'in_transit', 'delivered',
      'completed', 'cancelled', 'refill_requested', 'refill_pickup',
      'refill_in_store', 'refill_ready', 'return_requested', 'return_pickup', 'returned'
    ],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  qrCode: {
    type: String,
    unique: true,
    sparse: true
  },
  qrCodeUrl:{
    type: String,
    unique: false,
  },
  qrCodePrintedAt: Date,
  qrCodeScannedAt: Date,
  cylinderVerification: {
    photo: String,
    tareWeight: Number,
    netWeight: Number,
    grossWeight: Number,
    serialNumber: String,
    weightDifference: Number,
    verifiedAt: Date
  },
  payment: {
    method: {
      type: String,
      enum: ['jazzcash', 'easypaisa', 'card', 'cod'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: String,
    paidAt: Date
  },
  invoiceNumber: String,
  invoiceGeneratedAt: Date,
  invoiceUrl: String,
  rating: {
    stars: {
      type: Number,
      min: 1,
      max: 5
    },
    description: String,
    ratedAt: Date
  },
  isUrgent: {
    type: Boolean,
    default: false
  },
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  buyerNotes: String,
  driverNotes: String,
  sellerNotes: String,

  /* ====== NEW: mini-ledger inside the same order row ====== */
  paymentTimeline: [{
    type: { type: String, enum: ['pickup_fee','delivery_fee','refund','sale','other'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending','completed'], default: 'pending' },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],

  driverEarnings: [{
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending','paid'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }]

}, {
  timestamps: true
});

orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await this.constructor.countDocuments();
    this.orderId = `ORD-${Date.now()}-${count + 1}`;
  }
  next();
});

orderSchema.pre('save', function(next) {
  const { cylinderPrice, securityCharges, deliveryCharges, urgentDeliveryFee, addOnsTotal } = this.pricing;
  this.pricing.subtotal = (cylinderPrice * this.quantity) + addOnsTotal;
  this.pricing.grandTotal = this.pricing.subtotal + securityCharges + deliveryCharges + urgentDeliveryFee;

  console.log(`Price for order : ${this.pricing.grandTotal}`);
  console.log(`subtotal ${this.pricing.subtotal} + Security Charges : ${securityCharges} + Delivery charges : ${deliveryCharges} + Urgent Fee : ${urgentDeliveryFee}`);
  next();
});

orderSchema.index({ orderId: 1 });
orderSchema.index({ buyer: 1, status: 1 });
orderSchema.index({ seller: 1, status: 1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ qrCode: 1 });
orderSchema.index({ 'deliveryLocation.location': '2dsphere' });

module.exports = mongoose.model('Order', orderSchema);