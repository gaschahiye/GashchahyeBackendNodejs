const User = require('../models/User');
const Order = require('../models/Order');
const Location = require('../models/Location');
const Inventory = require('../models/Inventory');
const Notification = require('../models/Notification');
const NotificationService = require('./notification.service');
const { emitSellerApproval } = require('../config/socket');

class AdminService {
    /**
     * Get dashboard widget statistics
     */
    async getDashboardStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const [
            totalSellers,
            totalOrders,
            totalRevenueResult,
            activeDrivers,
            orderStatusCounts,
            monthlyData
        ] = await Promise.all([
            User.countDocuments({ role: 'seller' }),
            Order.countDocuments(),
            Order.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: { $add: ['$pricing.deliveryCharges', '$pricing.urgentDeliveryFee'] } },
                        orderCount: { $sum: 1 },
                        completedPaymentsRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$payment.status', 'completed'] },
                                    { $add: ['$pricing.deliveryCharges', '$pricing.urgentDeliveryFee'] },
                                    0
                                ]
                            }
                        },
                        pendingPaymentsRevenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$payment.status', 'pending'] },
                                    { $add: ['$pricing.deliveryCharges', '$pricing.urgentDeliveryFee'] },
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),
            User.countDocuments({
                role: 'driver',
                driverStatus: { $in: ['available', 'busy'] },
                isActive: true
            }),
            Order.aggregate([
                {
                    $facet: {
                        statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
                        totalCount: [{ $group: { _id: null, total: { $sum: 1 } } }]
                    }
                }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: sixMonthsAgo } } },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        monthlyRevenue: { $sum: { $add: ['$pricing.deliveryCharges', '$pricing.urgentDeliveryFee'] } },
                        orderCount: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        // Admin notifications
        const adminUsers = await User.find({ role: 'admin' }).select('_id');
        const adminIds = adminUsers.map(admin => admin._id);
        const adminNotifications = await Notification.find({ user: { $in: adminIds } })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'fullName businessName role');

        // Process data
        const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;
        const completedRevenue = totalRevenueResult[0]?.completedPaymentsRevenue || 0;
        const pendingRevenue = totalRevenueResult[0]?.pendingPaymentsRevenue || 0;

        const statusData = orderStatusCounts[0] || { statusCounts: [], totalCount: [{ total: 0 }] };
        const totalOrdersCount = statusData.totalCount[0]?.total || 0;

        const statusCategories = {
            'pending': 'Pending',
            'assigned': 'In Progress',
            'in_transit': 'In Progress',
            'pickup_ready': 'In Progress',
            'qrgenerated': 'In Progress',
            'accepted': 'In Progress',
            'delivered': 'Delivered',
            'completed': 'Delivered'
        };

        const statusAggregates = {};
        statusData.statusCounts.forEach(item => {
            const category = statusCategories[item._id] || 'Other';
            statusAggregates[category] = (statusAggregates[category] || 0) + item.count;
        });

        const formattedOrderStatusData = [];
        ['Delivered', 'In Progress', 'Pending'].forEach(status => {
            if (statusAggregates[status]) {
                formattedOrderStatusData.push({
                    status,
                    count: statusAggregates[status],
                    percentage: Math.round((statusAggregates[status] / totalOrdersCount) * 100 * 10) / 10
                });
            }
        });

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyOrderData = monthlyData.map(item => ({
            month: monthNames[item._id.month - 1],
            orders: item.orderCount,
            revenue: item.monthlyRevenue
        }));

        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthName = monthNames[date.getMonth()];
            const existingData = monthlyOrderData.find(m => m.month === monthName);
            last6Months.push({
                month: monthName,
                orders: existingData ? existingData.orders : 0
            });
        }

        const recentNotifications = adminNotifications.map(notif => ({
            id: notif._id,
            title: notif.title,
            message: notif.message,
            type: notif.type,
            isRead: notif.isRead,
            createdAt: notif.createdAt,
            user: notif.user ? {
                name: notif.user.fullName || notif.user.businessName,
                role: notif.user.role
            } : null
        }));

        return {
            totalSellers,
            totalOrders,
            totalRevenue,
            activeDrivers,
            monthlyOrderData: last6Months,
            orderStatusData: formattedOrderStatusData,
            recentNotifications,
            _debug: {
                totalOrders,
                revenueBreakdown: {
                    total: totalRevenue,
                    fromCompletedPayments: completedRevenue,
                    fromPendingPayments: pendingRevenue
                }
            }
        };
    }

    /**
     * Get paginated list of sellers with stats
     */
    async getSellersList(query, page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [sellers, total] = await Promise.all([
            User.find(query)
                .select('businessName phoneNumber email sellerStatus orgaLicenseNumber createdAt ')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ]);

        const sellersWithStats = await Promise.all(
            sellers.map(async (seller) => {
                const [totalOrders, completedOrders, inventory] = await Promise.all([
                    Order.countDocuments({ seller: seller._id }),
                    Order.countDocuments({ seller: seller._id, status: 'completed' }),
                    Inventory.findOne({ seller: seller._id })
                ]);

                return {
                    ...seller.toObject(),
                    stats: {
                        totalOrders,
                        completedOrders,
                        totalInventory: inventory?.totalInventory || 0
                    }
                };
            })
        );

        return {
            sellers: sellersWithStats,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalSellers: total,
                hasNext: page * limit < total
            }
        };
    }

    /**
     * Get detailed seller info
     */
    async getSellerDetails(sellerId) {
        const seller = await User.findById(sellerId);
        if (!seller || seller.role !== 'seller') throw new Error('Seller not found');

        const [locations, inventory, orders, ratings] = await Promise.all([
            Location.find({ seller: sellerId }),
            Inventory.find({ seller: sellerId }).populate('location'),
            Order.find({ seller: sellerId })
                .populate('buyer', 'fullName phoneNumber')
                .sort({ createdAt: -1 })
                .limit(50),
            Rating.find({ seller: sellerId })
        ]);

        const totalOrders = await Order.countDocuments({ seller: sellerId });
        const completedOrders = await Order.countDocuments({
            seller: sellerId,
            status: 'completed'
        });
        const totalRevenue = await Order.aggregate([
            { $match: { seller: sellerId, 'payment.status': 'completed' } },
            { $group: { _id: null, total: { $sum: '$pricing.grandTotal' } } }
        ]);

        return {
            ...seller.toObject(),
            locations,
            inventory,
            orders,
            ratings,
            stats: {
                totalOrders,
                completedOrders,
                totalRevenue: totalRevenue[0]?.total || 0,
                averageRating: seller.rating.average,
                ratingCount: seller.rating.count
            }
        };
    }

    /**
     * Update seller status
     */
    async updateSellerStatus(sellerId, status, notes) {
        const seller = await User.findById(sellerId);
        if (!seller || seller.role !== 'seller') throw new Error('Seller not found');

        seller.sellerStatus = status;
        await seller.save();

        await NotificationService.createNotification(sellerId, {
            title: `Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: status === 'approved'
                ? 'Your seller account has been approved. You can now start managing your business.'
                : `Your seller account has been rejected. ${notes || ''}`,
            type: status === 'approved' ? 'seller_approved' : 'seller_rejected',
            data: { notes }
        });

        emitSellerApproval(sellerId, status);
        return seller;
    }

    /**
     * Get list of drivers with stats
     */
    async getDriversList(query, page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [drivers, total] = await Promise.all([
            User.find(query)
                .select('fullName phoneNumber vehicleNumber zone driverStatus isActive autoAssignOrders createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ]);

        const driversWithStats = await Promise.all(
            drivers.map(async (driver) => {
                const [assignedOrders, deliveredOrders] = await Promise.all([
                    Order.countDocuments({ driver: driver._id }),
                    Order.countDocuments({ driver: driver._id, status: 'delivered' })
                ]);

                return {
                    ...driver.toObject(),
                    stats: {
                        assignedOrders,
                        deliveredOrders
                    }
                };
            })
        );

        return {
            drivers: driversWithStats,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalDrivers: total,
                hasNext: page * limit < total
            }
        };
    }

    /**
     * Create new driver
     */
    async createDriver(driverData) {
        const existingDriver = await User.findOne({
            $or: [
                { phoneNumber: driverData.phoneNumber },
                { vehicleNumber: driverData.vehicleNumber },
                { cnic: driverData.cnic }
            ]
        });

        if (existingDriver) {
            if (existingDriver.phoneNumber === driverData.phoneNumber) throw new Error('Driver with this phone number already exists');
            if (existingDriver.vehicleNumber === driverData.vehicleNumber) throw new Error('Driver with this vehicle number already exists');
            if (existingDriver.cnic === driverData.cnic) throw new Error('CNIC already registered');
        }

        return await User.create({
            ...driverData,
            role: 'driver',
            isVerified: true,
            driverStatus: 'available'
        });
    }

    /**
     * Update driver
     */
    async updateDriver(driverId, updates) {
        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') throw new Error('Driver not found');

        const allowedUpdates = [
            'fullName', 'vehicleNumber', 'zone', 'autoAssignOrders',
            'driverStatus', 'isActive', 'currentLocation'
        ];

        Object.keys(updates).forEach(key => {
            if (allowedUpdates.includes(key)) {
                driver[key] = updates[key];
            }
        });

        return await driver.save();
    }

    /**
     * Assign driver to order
     */
    async assignDriverToOrder(orderId, driverId, adminUser) {
        const [order, driver] = await Promise.all([
            Order.findById(orderId),
            User.findById(driverId)
        ]);

        if (!order) throw new Error('Order not found');
        if (!driver || driver.role !== 'driver') throw new Error('Driver not found');
        if (!driver.isActive) throw new Error('Driver is not active');

        order.driver = driverId;
        order.status = 'assigned';
        order.statusHistory.push({
            status: 'assigned',
            updatedBy: adminUser._id,
            notes: `Driver ${driver.fullName} assigned by admin`
        });

        // ✅ NEW: Add to driverEarnings
        // Check if already exists to avoid duplicates
        const earningExists = order.driverEarnings.some(e => e.driver.toString() === driverId.toString());
        if (!earningExists) {
            // Use pricing.deliveryCharges as the source of truth
            const deliveryAmount = (order.pricing && order.pricing.deliveryCharges)
                ? (order.pricing.deliveryCharges + (order.pricing.urgentDeliveryFee || 0))
                : 0;

            if (deliveryAmount > 0) {
                order.driverEarnings.push({
                    driver: driverId,
                    amount: deliveryAmount,
                    status: 'pending',
                    createdAt: new Date()
                });
            }
        }

        await order.save();

        driver.driverStatus = 'busy';
        await driver.save();

        await NotificationService.sendOrderNotification(order, 'order_assigned');
        return order;
    }
}

module.exports = new AdminService();
