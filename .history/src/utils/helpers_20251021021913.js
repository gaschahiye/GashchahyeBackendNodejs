const jwt = require('jsonwebtoken');

exports.generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

exports.generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE
  });
};

exports.calculateDistance = (coords1, coords2) => {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
};

exports.generateOrderId = () => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

exports.generateInvoiceNumber = (count) => {
  return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
};