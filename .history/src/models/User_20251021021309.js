const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['admin', 'seller', 'driver', 'buyer'],
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^(\+92|0)?3[0-9]{9}$/.test(v);
      },
      message: 'Invalid Pakistani phone number'
    }
  },
  email: {
    type: String,
    sparse: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return !v || /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
      },
      message: 'Invalid email address'
    }
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: 8,
    select: false
  },
  googleId: {
    type: String,
    sparse: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  language: {
    type: String,
    enum: ['english', 'urdu', 'pashto'],
    default: 'english'
  },
  
  // Buyer specific
  fullName: {
    type: String,
    required: function() {
      return this.role === 'buyer' || this.role === 'driver';
    }
  },
  cnic: {
    type: String,
    sparse: true,
    validate: {
      validator: function(v) {
        return !v || /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(v);
      },
      message: 'Invalid CNIC format'
    }
  },
  userType: {
    type: String,
    enum: ['domestic', 'commercial'],
    required: function() {
      return this.role === 'buyer';
    }
  },
  addresses: [{
    label: String,
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    },
    isDefault: Boolean
  }],
  
  // Seller specific
  businessName: {
    type: String,
    required: function() {
      return this.role === 'seller';
    }
  },
  orgaLicenseNumber: {
    type: String,
    required: function() {
      return this.role === 'seller';
    }
  },
  orgaExpDate: {
    type: Date,
    required: function() {
      return this.role === 'seller';
    }
  },
  ntnNumber: {
    type: String,
    required: function() {
      return this.role === 'seller';
    }
  },
  sellerStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  
  // Driver specific
  vehicleNumber: {
    type: String,
    required: function() {
      return this.role === 'driver';
    }
  },
  zone: {
    type: String,
    required: function() {
      return this.role === 'driver';
    }
  },
  autoAssignOrders: {
    type: Boolean,
    default: false
  },
  driverStatus: {
    type: String,
    enum: ['available', 'busy', 'offline'],
    default: 'available'
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number]
  },
  
  // Auth
  otp: {
    code: String,
    expiresAt: Date
  },
  refreshToken: String,
  fcmToken: String
}, {
  timestamps: true
});

// Indexes
userSchema.index({ 'addresses.location': '2dsphere' });
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1, sellerStatus: 1 });

// Hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);