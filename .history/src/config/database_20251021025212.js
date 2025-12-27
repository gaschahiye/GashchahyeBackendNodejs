const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create default admin user if not exists
    await createDefaultAdmin();
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }
};

const createDefaultAdmin = async () => {
  try {
    const User = require('../models/User');
    const bcrypt = require('bcrypt');
    
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      
      await User.create({
        role: 'admin',
        phoneNumber: '+923001234567',
        email: 'admin@lpg.com',
        password: hashedPassword,
        fullName: 'System Administrator',
        isVerified: true,
        isActive: true
      });
      
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error creating default admin:', error.message);
  }
};

module.exports = connectDB;