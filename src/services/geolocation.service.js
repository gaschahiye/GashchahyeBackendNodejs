const User = require('../models/User');
const Location = require('../models/Location');
const { calculateDistance } = require('../utils/helpers');

exports.findNearbySellers = async (latitude, longitude, radius = 5000, sortBy = 'distance') => {
  try {
    const sellers = await User.aggregate([
      {
        $match: {
          role: 'seller',
          sellerStatus: 'approved',
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'locations',
          let: { sellerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$seller', '$sellerId'] },
                isActive: true,
                location: {
                  $geoWithin: {
                    $centerSphere: [[longitude, latitude], radius / 6378100]
                  }
                }
              }
            }
          ],
          as: 'locations'
        }
      },
      {
        $match: {
          'locations.0': { $exists: true }
        }
      },
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: 'seller',
          as: 'inventory'
        }
      }
    ]);
    
    // Calculate distances
    sellers.forEach(seller => {
      const distances = seller.locations.map(loc => 
        calculateDistance([longitude, latitude], loc.location.coordinates)
      );
      seller.distance = Math.min(...distances);
    });
    
    // Sort
    switch (sortBy) {
      case 'rating':
        sellers.sort((a, b) => b.rating.average - a.rating.average);
        break;
      case 'orders':
        sellers.sort((a, b) => b.rating.count - a.rating.count);
        break;
      case 'price_low':
        sellers.sort((a, b) => (a.inventory[0]?.pricePerKg || 0) - (b.inventory[0]?.pricePerKg || 0));
        break;
      case 'price_high':
        sellers.sort((a, b) => (b.inventory[0]?.pricePerKg || 0) - (a.inventory[0]?.pricePerKg || 0));
        break;
      default:
        sellers.sort((a, b) => a.distance - b.distance);
    }
    
    return sellers;
  } catch (error) {
    logger.error('Find nearby sellers error:', error);
    throw error;
  }
};