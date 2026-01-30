const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../src/app'); // Adjust path to your app entry point
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const Cylinder = require('../../src/models/Cylinder');
const Inventory = require('../../src/models/Inventory');
const Location = require('../../src/models/Location');
const { generateToken } = require('../../src/utils/auth.utils'); // Adjust if needed

describe('Return Flow Integration Test', () => {
    let buyer, seller, driver, tokenBuyer, tokenDriver;
    let cylinder, inventory, location;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI);
        await User.deleteMany({});
        await Order.deleteMany({});
        await Cylinder.deleteMany({});
        await Inventory.deleteMany({});
        await Location.deleteMany({});

        // 1. Create Users
        buyer = await User.create({
            name: 'Buyer Bob',
            phoneNumber: '+923000000001',
            password: 'password123',
            role: 'buyer',
            addresses: [{
                label: 'Home',
                address: '123 Buyer St',
                location: { type: 'Point', coordinates: [74.3587, 31.5204] },
                isDefault: true
            }]
        });
        tokenBuyer = buyer.generateAuthToken();

        seller = await User.create({
            businessName: 'Seller Sam',
            phoneNumber: '+923000000002',
            password: 'password123',
            role: 'seller',
            sellerStatus: 'approved',
            isActive: true
        });

        driver = await User.create({
            fullName: 'Driver Dan',
            phoneNumber: '+923000000003',
            password: 'password123',
            role: 'driver',
            isActive: true,
            driverStatus: 'available',
            autoAssignOrders: true,
            zone: {
                centerPoint: { latitude: 31.5204, longitude: 74.3587 },
                radiusKm: 10
            },
            currentLocation: { type: 'Point', coordinates: [74.3587, 31.5204] }
        });
        tokenDriver = driver.generateAuthToken();

        // 2. Create Location & Inventory
        location = await Location.create({
            seller: seller._id,
            name: 'Main Warehouse',
            address: '456 Seller St',
            city: 'Lahore',
            location: { type: 'Point', coordinates: [74.3600, 31.5300] },
            isActive: true
        });

        inventory = await Inventory.create({
            seller: seller._id,
            locationid: location._id,
            pricePerKg: 300,
            cylinders: {
                '11.8kg': { quantity: 10, price: 4000 }
            }
        });

        // 3. Create a Cylinder owned by Buyer (Simulating previous purchase)
        // Order is needed to link back
        const oldOrder = await Order.create({
            orderId: 'ORD-TEST-001',
            buyer: buyer._id,
            seller: seller._id,
            warehouse: inventory._id,
            orderType: 'new',
            cylinderSize: '11.8kg',
            quantity: 1,
            deliveryLocation: { address: '123 Buyer St', location: { type: 'Point', coordinates: [74.3587, 31.5204] } },
            pricing: { cylinderPrice: 4000, deliveryCharges: 100, subtotal: 4000, grandTotal: 4100 },
            payment: { method: 'cod' },
            status: 'completed'
        });

        cylinder = await Cylinder.create({
            buyer: buyer._id,
            seller: seller._id,
            order: oldOrder._id,
            warehouse: inventory._id,
            size: '11.8kg',
            serialNumber: 'CYL-RET-001',
            qrCode: 'QR-CYL-RET-001',
            weights: { tareWeight: 10, netWeight: 11.8, grossWeight: 21.8, weightDifference: 0 },
            status: 'active'
        });
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    test('1. Buyer requests return and rate', async () => {
        const res = await request(app)
            .post('/api/buyer/request-return-and-rate')
            .set('Authorization', `Bearer ${tokenBuyer}`)
            .send({
                cylinderId: cylinder._id,
                stars: 5,
                description: 'Great cylinder!',
                type: 'return'
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.order).toBeDefined();

        const orderId = res.body.order._id;
        const newOrder = await Order.findById(orderId);
        expect(newOrder.orderType).toBe('return');
        // Driver should be assigned because we created one in zone
        expect(newOrder.driver.toString()).toBe(driver._id.toString());
        expect(newOrder.status).toBe('return_pickup');

        const updatedCylinder = await Cylinder.findById(cylinder._id);
        expect(updatedCylinder.status).toBe('return_requested');

        // Save orderId for next steps
        global.returnOrderId = orderId;
    });

    test('2. Driver scans Pickup QR (at Buyer)', async () => {
        // Driver scans CYLINDER QR (or Order QR? Logic in driver.controller.js line 444 compares pickingUpCylinder.qrCode)
        // Wait, line 444: `if (pickingUpCylinder.qrCode !== qrCode)`
        // So we must scan the CYLINDER QR.

        const res = await request(app)
            .post(`/api/driver/scan-qrcode/${global.returnOrderId}`)
            .set('Authorization', `Bearer ${tokenDriver}`)
            .send({ qrCode: 'QR-CYL-RET-001' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Return Pickup Confirmed/);

        const order = await Order.findById(global.returnOrderId);
        expect(order.status).toBe('empty_return');

        const cyl = await Cylinder.findById(cylinder._id);
        expect(cyl.status).toBe('in_transit');
    });

    test('3. Driver scans Dropoff QR (at Seller)', async () => {
        // Driver drops off at Seller.
        // Logic line 495: `if (returnedCylinder.qrCode !== qrCode)`

        const res = await request(app)
            .post(`/api/driver/scan-qrcode/${global.returnOrderId}`)
            .set('Authorization', `Bearer ${tokenDriver}`)
            .send({ qrCode: 'QR-CYL-RET-001' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Return Verified. Order Completed/);

        const order = await Order.findById(global.returnOrderId);
        expect(order.status).toBe('completed');

        // Cylinder should be deleted (as per current driver logic line 516)
        const cyl = await Cylinder.findById(cylinder._id);
        expect(cyl).toBeNull();
    });
});
