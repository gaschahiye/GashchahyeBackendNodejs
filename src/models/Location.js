const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  warehouseName: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (v) {
          return (
              v.length === 2 &&
              v[0] >= -180 && v[0] <= 180 &&
              v[1] >= -90 && v[1] <= 90
          );
        },
        message: 'Invalid coordinates',
      },
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

locationSchema.index({ location: '2dsphere' });
locationSchema.index({ seller: 1, city: 1 });
locationSchema.index({ seller: 1, isActive: 1 });

// ✅ THIS IS THE CRUCIAL FIX
module.exports = mongoose.models.Location || mongoose.model('Location', locationSchema);
