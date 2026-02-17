const mongoose = require('mongoose');
const Inventory = require('./src/models/Inventory');
const sellerController = require('./src/controllers/seller.controller');

require('dotenv').config();

// Simple mock for Express Request/Response
const mockReq = (body, params, user) => ({
    body,
    params,
    user
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function runVerification() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find a seller and inventory
        const inventory = await Inventory.findOne().populate('seller');
        if (!inventory) {
            console.log('No inventory found.');
            return;
        }
        const seller = inventory.seller;
        console.log(`Testing with Inventory ID: ${inventory._id} (Seller: ${seller.email})`);

        const originalQty = inventory.cylinders['15kg']?.quantity || 0;
        console.log(`Original 15kg Qty: ${originalQty}`);

        // 2. Mock Request
        const newQty = originalQty + 5;
        const req = mockReq(
            { cylinders: { '15kg': { quantity: newQty } } }, // Body
            { inventoryId: inventory._id.toString() },       // Params
            { _id: seller._id, role: 'seller' }              // User
        );
        const res = mockRes();
        const next = (err) => { console.error('Controller error:', err); };

        // 3. Execute Controller
        await sellerController.updateInventoryQuantity(req, res, next);

        // 4. Verify Persistence
        const updatedInventory = await Inventory.findById(inventory._id);
        const finalQty = updatedInventory.cylinders['15kg']?.quantity;
        console.log(`Final 15kg Qty in DB: ${finalQty}`);

        if (finalQty === newQty) {
            console.log('✅ SUCCESS: Inventory update persisted!');
        } else {
            console.log('❌ FAILED: Inventory update did NOT persist.');
        }

        // Revert
        updatedInventory.cylinders['15kg'].quantity = originalQty;
        updatedInventory.markModified('cylinders');
        await updatedInventory.save();
        console.log('Reverted changes.');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
