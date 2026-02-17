const mongoose = require('mongoose');
const AdminService = require('./src/services/admin.service');
const Inventory = require('./src/models/Inventory');
const Location = require('./src/models/Location');
const User = require('./src/models/User');

require('dotenv').config();

async function runVerification() {
    try {
        // Connect to DB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find an existing inventory/warehouse
        const inventory = await Inventory.findOne().populate('locationid');
        if (!inventory) {
            console.log('No inventory found to test.');
            return;
        }

        const warehouseId = inventory.locationid._id;
        console.log(`Testing with Warehouse ID: ${warehouseId}`);
        console.log(`Current Price: ${inventory.pricePerKg}`);
        const originalPrice = inventory.pricePerKg;

        // 2. Simulate Update
        const newPrice = originalPrice + 10;
        console.log(`Updating price to: ${newPrice}`);

        const updates = {
            pricePerKg: newPrice,
            cylinders: {
                '11.8kg': { quantity: 100, price: 5000 }
            }
        };

        const updatedInventory = await AdminService.updateInventoryByWarehouseId(warehouseId, updates);
        console.log('Update result:', updatedInventory.pricePerKg === newPrice ? 'SUCCESS' : 'FAILED');

        // 3. Verify City-Wide Propagation
        const otherInventories = await Inventory.find({
            seller: inventory.seller,
            city: inventory.city,
            _id: { $ne: inventory._id }
        });

        if (otherInventories.length > 0) {
            console.log(`Checking ${otherInventories.length} other inventories in ${inventory.city}...`);
            const allUpdated = otherInventories.every(inv => inv.pricePerKg === newPrice);
            console.log('City-wide propagation:', allUpdated ? 'SUCCESS' : 'FAILED');
        } else {
            console.log('No other inventories in this city to check propagation.');
        }

        // 4. Revert changes
        console.log('Reverting changes...');
        await AdminService.updateInventoryByWarehouseId(warehouseId, { pricePerKg: originalPrice });
        console.log('Reverted successfully.');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
