const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
    minlength: 8
  },
  orgaLicenseFile: {
    type: String,
    required: false,
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

  // Buyer specific fields
  fullName: {
    type: String,
    required: function() {
      return this.role === 'buyer';
    }
  },
  cnic: {
    type: String,
    sparse: true,
    validate: {
      validator: function(v) {
        return !v || /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(v);
      },
      message: 'Invalid CNIC format (XXXXX-XXXXXXX-X)'
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
    city:String,
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
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],

  // Seller specific fields
  businessName: String,
  orgaLicenseNumber: String,
  orgaExpDate: Date,
  ntnNumber: String,
  sellerStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },

  // Driver specific fields
  vehicleNumber: String,
  zone: {
    zoneId: {
      type: String,
      required: function () {
        return this.role === 'driver';
      }
    },
    zoneName: {
      type: String,
      required: function () {
        return this.role === 'driver';
      }
    },
    description: {
      type: String
    },
    includedAreas: {
      type: [String],
      default: []
    },
    centerPoint: {
      latitude: {
        type: Number,
        required: function () {
          return this.role === 'driver';
        }
      },
      longitude: {
        type: Number,
        required: function () {
          return this.role === 'driver';
        }
      },
      explanation: {
        type: String
      }
    },
    radiusKm: {
      type: Number,
      required: function () {
        return this.role === 'driver';
      }
    },
    radiusExplanation: {
      type: String
    },
    example: {
      type: String
    }
  },
  licenseNumber:{
    type:String,
    required: function(){
      return this.role === 'driver';
    },

  },
  autoAssignOrders: {
    type: Boolean,
    default: true
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
    },
    coordinates: {
      type: [Number],
    }
  },

  // Auth related
  otp: {
    code: String,
    expiresAt: Date
  },
  refreshToken: String,
  fcmToken: String,

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

//
// 🔗 Virtual Reference to Locations
//
userSchema.virtual('locations', {
  ref: 'Location',
  localField: '_id',
  foreignField: 'seller'
});

//
// 🔄 Auto-populate locations on every find query
//
userSchema.pre(/^find/, function(next) {
  this.populate('locations');
  next();
});

//
// 🔒 Indexes
//
userSchema.index({ 'addresses.location': '2dsphere' });
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1, sellerStatus: 1 });

//
// 🔑 Password Hashing
//
userSchema.pre('save', async function(next) {
  if (this.role === 'admin') {
    this.addresses = undefined;
    this.currentLocation = undefined;
  }
  if(this.role == 'driver'){
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
  }

  next();
});

//
// 🔑 Compare Passwords
//
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

//
// 🔐 JWT Token Generators
//
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
      { userId: this._id, role: this.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
  );
};

userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
      { userId: this._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

module.exports = mongoose.model('User', userSchema);
