const request = require('supertest');
const mongoose = require('mongoose');

// MOCK GOOGLE SHEET SERVICE before checking server.js that requires it
jest.mock('google-spreadsheet', () => ({
    GoogleSpreadsheet: jest.fn().mockImplementation(() => ({
        useServiceAccountAuth: jest.fn(),
        loadInfo: jest.fn(),
        sheetsByIndex: [{
            addRow: jest.fn(),
            getRows: jest.fn().mockResolvedValue([]),
        }],
    })),
}));

jest.mock('google-auth-library', () => ({
    JWT: jest.fn(),
}));

const app = require('../../server'); // Assuming server.js exports app
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const Cylinder = require('../../src/models/Cylinder');
const Inventory = require('../../src/models/Inventory');

// Mock Auth Middleware? Or use login/token?
describe('Refill Flow Integration Test', () => {
    let buyer, seller, driver, inventory, cylinder, tokenBuyer, tokenSeller, tokenDriver;

    // Helper to generate token (mock)
    const generateToken = (user) => {
        const jwt = require('jsonwebtoken');
        return jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    };

    beforeAll(async () => {
        // Connect to TEST DB
        await mongoose.connect(process.env.MONGO_URI_TEST || process.env.MONGO_URI);
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        // Cleanup
        await User.deleteMany({});
        await Order.deleteMany({});
        await Cylinder.deleteMany({});
        await Inventory.deleteMany({});

        // Create Users
        seller = await User.create({
            businessName: 'Seller Biz', fullName: 'Seller One', email: 'seller@test.com', password: 'password', role: 'seller', sellerStatus: 'approved', isActive: true, phoneNumber: '11111', currentLocation: { type: 'Point', coordinates: [0, 0] }
        });
        buyer = await User.create({
            fullName: 'Buyer One', email: 'buyer@test.com', password: 'password', role: 'buyer', isActive: true, phoneNumber: '22222', currentLocation: { type: 'Point', coordinates: [0, 0] }
        });
        driver = await User.create({
            fullName: 'Driver One', email: 'driver@test.com', password: 'password', role: 'driver', isActive: true, phoneNumber: '33333',
            driverStatus: 'available',
            zone: { centerPoint: { latitude: 0, longitude: 0 }, radiusKm: 100 }
        });

        tokenBuyer = generateToken(buyer);
        tokenSeller = generateToken(seller);
        tokenDriver = generateToken(driver);

        // Create Inventory
        inventory = await Inventory.create({
            seller: seller._id,
            location: { type: 'Point', coordinates: [0, 0] },
            city: 'Test City',
            pricePerKg: 10,
            cylinders: { '11.8kg': { quantity: 10, price: 500 } }
        });

        // Create Existing Cylinder for Buyer
        const order = await Order.create({
            orderId: 'ORD-ORIG', buyer: buyer._id, seller: seller._id, warehouse: inventory._id,
            orderType: 'new', cylinderSize: '11.8kg', quantity: 1, pricing: { subtotal: 100, grandTotal: 100, deliveryCharges: 0, cylinderPrice: 100 },
            deliveryLocation: { address: 'Test', location: { type: 'Point', coordinates: [0, 0] } },
            payment: { method: 'cod' }
        });

        cylinder = await Cylinder.create({
            buyer: buyer._id, seller: seller._id, order: order._id, status: 'empty', size: '11.8kg',
            serialNumber: 'CYL-EMPTY-1', qrCode: 'QR-CYL-1', weights: { tareWeight: 10, netWeight: 10, grossWeight: 20, weightDifference: 0 }
        });
    });

    test('Refill Request -> Seller Approve -> Driver Pickup -> Deliver', async () => {
        // 1. BUYER REQUESTS REFILL
        const resReq = await request(app)
            .post('/api/buyer/requestRefill') // Verify route path
            .set('Authorization', `Bearer ${tokenBuyer}`)
            .send({ cylinderId: cylinder._id, newSize: '11.8kg' });

        expect(resReq.status).toBe(200);
        expect(resReq.body.order.status).toBe('refill_requested');
        const orderId = resReq.body.order.orderId;
        const dbOrderId = resReq.body.order._id;

        // 2. SELLER APPROVES
        const resApprove = await request(app)
            .put(`/api/seller/orders/${orderId}/approve`) // Using route for 'approveRefill' (Checking routes!)
            // Note: need to confirm route name. Plan said approveRefill endpoint.
            // Assuming we mapped it to /approve or reuse mark-ready. 
            // Let's use /mark-ready as per previous route file structure, assuming we kept the path but changed logic.
            // Double check seller.routes.js if possible, but assuming standard rest.
            .set('Authorization', `Bearer ${tokenSeller}`)
            .send({ warehouseId: inventory._id });

        // If route is different, test will fail and we fix.
        expect(resApprove.status).toBe(200);
        expect(resApprove.body.data.driverAssigned).toBe(true);
        const updatedOrder = await Order.findById(dbOrderId);
        expect(updatedOrder.status).toBe('pickup_ready');
        expect(updatedOrder.driver.toString()).toBe(driver._id.toString());

        // 3. DRIVER PICKUP (Scans Order QR)
        // Ensure QR exists. In driver controller we set Order QR = Order ID ?? No, we stopped overwriting Cylinder QR.
        // Order QR is usually set on creation or generateQRCode.
        // Initial Refill Request didn't set QR.
        // Logic check: does approveRefill set QR? No.
        // So Driver needs to Generate QR or we use OrderId?
        // Driver Controller `scanQRCode` checks `if (order.qrCode !== qrCode)`.
        // So `order.qrCode` must be set.
        // Let's call generateQRCode first.

        await request(app).post(`/api/driver/orders/${dbOrderId}/generateQRCode`)
            .set('Authorization', `Bearer ${tokenDriver}`);

        const orderWithQR = await Order.findById(dbOrderId);
        expect(orderWithQR.qrCode).toBeDefined();
        const qrCode = orderWithQR.qrCode;

        // Verify Pickup Scan
        const resPickup = await request(app)
            .post(`/api/driver/orders/${dbOrderId}/scanQRCode`)
            .set('Authorization', `Bearer ${tokenDriver}`)
            .send({ qrCode: qrCode });

        expect(resPickup.status).toBe(200);
        expect(resPickup.body.order.status).toBe('in_transit');

        // 4. DRIVER DELIVER (Swap: Deliver Fresh, Pickup Empty)
        const resDeliver = await request(app)
            .post(`/api/driver/orders/${dbOrderId}/scanQRCode`)
            .set('Authorization', `Bearer ${tokenDriver}`)
            .send({ qrCode: qrCode }); // Same QR for trip

        expect(resDeliver.status).toBe(200);
        expect(resDeliver.body.order.status).toBe('delivered');

        // 5. VERIFY SWAP LOGIC
        // a) New Cylinder Created/Assigned
        const finalOrder = await Order.findById(dbOrderId).populate('deliveredCylinder');
        expect(finalOrder.deliveredCylinder).toBeDefined();
        expect(finalOrder.deliveredCylinder.status).toBe('active');
        expect(finalOrder.deliveredCylinder.buyer.toString()).toBe(buyer._id.toString());

        // b) Old Cylinder Returned to Transit
        const oldCyl = await Cylinder.findById(cylinder._id);
        expect(oldCyl.status).toBe('in_transit');
        expect(oldCyl.buyer).toBeNull();
    });
});
