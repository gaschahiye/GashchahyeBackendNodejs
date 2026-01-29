const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
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
  stars: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['delivery', 'return', 'refill', 'suggestion', 'complaint'],
    required: true
  }
}, {
  timestamps: true
});

ratingSchema.post('save', async function () {
  const Rating = this.constructor;
  const User = mongoose.model('User');

  const stats = await Rating.aggregate([
    { $match: { seller: this.seller } },
    {
      $group: {
        _id: '$seller',
        average: { $avg: '$stars' },
        count: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await User.findByIdAndUpdate(this.seller, {
      'rating.average': parseFloat(stats[0].average.toFixed(1)),
      'rating.count': stats[0].count
    });
  }
});

ratingSchema.index({ seller: 1 });
ratingSchema.index({ buyer: 1 });
ratingSchema.index({ order: 1 });

module.exports = mongoose.model('Rating', ratingSchema);