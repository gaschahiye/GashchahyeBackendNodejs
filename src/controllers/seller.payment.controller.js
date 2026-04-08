const Order = require('../models/Order');
const mongoose = require('mongoose');

/**
 * Get Payment Timeline for Seller's Orders
 * @route GET /api/seller/payments
 */
const getSellerPaymentTimeline = async (req, res, next) => {
    try {
        const {
            dateFrom,
            dateTo,
            status,
            type,
            searchQuery
        } = req.query;

        const sellerId = req.user._id;

        const query = { seller: sellerId };

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const endDate = new Date(dateTo);
                endDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDate;
            }
        }

        const pipeline = [];

        // Initial filtering - only orders for this seller
        pipeline.push({ $match: query });

        pipeline.push({ $unwind: '$paymentTimeline' });

        // ✅ FILTER: Exclude payments without timelineId
        pipeline.push({
            $match: {
                'paymentTimeline.timelineId': { $exists: true, $ne: null, $ne: '' }
            }
        });

        // ✅ FILTER: Conditional Display for Delivery (Security Deposits now always shown)
        // "Don't show delivery fee until the order type is return"
        pipeline.push({
            $match: {
                $expr: {
                    $or: [
                        // Show if it's NOT a delivery_fee
                        { $ne: ['$paymentTimeline.type', 'delivery_fee'] },
                        // OR Show if it IS a delivery_fee BUT Order Type is 'return'
                        {
                            $and: [
                                { $eq: ['$orderType', 'return'] },
                                { $eq: ['$paymentTimeline.type', 'delivery_fee'] }
                            ]
                        }
                    ]
                }
            }
        });

        // Lookup Driver
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'paymentTimeline.driverId',
                foreignField: '_id',
                as: 'driverDetails'
            }
        });

        // Lookup Seller
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'seller',
                foreignField: '_id',
                as: 'sellerDetails'
            }
        });

        // Lookup Buyer
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'buyer',
                foreignField: '_id',
                as: 'buyerDetails'
            }
        });

        // Flatten Lookups
        pipeline.push({
            $addFields: {
                driver: { $arrayElemAt: ['$driverDetails', 0] },
                sellerInfo: { $arrayElemAt: ['$sellerDetails', 0] },
                buyerInfo: { $arrayElemAt: ['$buyerDetails', 0] }
            }
        });

        // Resolve Person Name, Type, Phone, IDs based on payment type
        pipeline.push({
            $addFields: {
                resolvedPerson: {
                    $switch: {
                        branches: [
                            {
                                case: { $eq: ['$paymentTimeline.type', 'delivery_fee'] },
                                then: {
                                    name: '$driver.fullName',
                                    type: 'driver',
                                    phone: '$driver.phoneNumber',
                                    personId: '$driver._id'
                                }
                            },
                            {
                                case: { $in: ['$paymentTimeline.type', ['sale', 'seller_payment']] },
                                then: {
                                    name: '$sellerInfo.businessName',
                                    type: 'seller',
                                    phone: '$sellerInfo.phoneNumber',
                                    personId: '$sellerInfo._id'
                                }
                            },
                            {
                                case: { $in: ['$paymentTimeline.type', ['refund', 'partial_refund']] },
                                then: {
                                    name: '$buyerInfo.fullName',
                                    type: 'buyer',
                                    phone: '$buyerInfo.phoneNumber',
                                    personId: '$buyerInfo._id'
                                }
                            },
                            {
                                case: { $eq: ['$paymentTimeline.type', 'security_deposit'] },
                                then: {
                                    name: 'Platform/Admin',
                                    type: 'admin',
                                    phone: 'N/A',
                                    personId: null
                                }
                            }
                        ],
                        default: {
                            name: 'Unknown',
                            type: 'other',
                            phone: '',
                            personId: null
                        }
                    }
                }
            }
        });

        // Filters moved to after projection so they only affect the list, not the global stats!

        // Project Final Structure
        pipeline.push({
            $project: {
                _id: 0,
                id: '$paymentTimeline.timelineId',
                timelineId: '$paymentTimeline.timelineId',
                orderId: '$orderId',
                personName: { $ifNull: ['$resolvedPerson.name', 'N/A'] },
                personType: '$resolvedPerson.type',
                phone: { $ifNull: ['$resolvedPerson.phone', 'N/A'] },
                paymentType: { $ifNull: ['$paymentTimeline.type', 'other'] },
                amount: '$paymentTimeline.amount',
                paymentMethod: '$paymentTimeline.paymentMethod',
                status: '$paymentTimeline.status',
                date: '$paymentTimeline.createdAt',
                settledDate: '$paymentTimeline.processedAt',
                settledBy: '$paymentTimeline.processedBy',
                notes: { $ifNull: ['$paymentTimeline.cause', ''] },
                sellerId: { $toString: '$sellerInfo._id' },
                buyerId: { $toString: '$buyerInfo._id' },
                driverId: { $ifNull: [{ $toString: '$driver._id' }, null] },
                liabilityType: '$paymentTimeline.liabilityType',
                referenceId: '$paymentTimeline.referenceId',
                originalPaymentMethod: '$payment.method'
            }
        });

        pipeline.push({ $sort: { date: -1 } });

        // Build the data filter pipeline specifically for the list view
        const dataFilters = [];

        if (searchQuery) {
            dataFilters.push({
                $match: {
                    $or: [
                        { 'orderId': { $regex: searchQuery, $options: 'i' } },
                        { 'personName': { $regex: searchQuery, $options: 'i' } },
                        { 'phone': { $regex: searchQuery, $options: 'i' } }
                    ]
                }
            });
        }

        if (status) {
            if (status === 'completed' || status === 'cleared') {
                dataFilters.push({ $match: { 'status': { $in: ['completed', 'collected'] } } });
            } else {
                dataFilters.push({ $match: { 'status': status } });
            }
        }
        
        if (type) dataFilters.push({ $match: { 'paymentType': type } });

        // Facet for Stats and Data (no pagination - get all)
        pipeline.push({
            $facet: {
                data: dataFilters,
                stats: [
                    {
                        $group: {
                            _id: null,
                            // Income (Sales/Payments)
                            pendingIncome: {
                                $sum: { 
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['sale', 'seller_payment', 'security_deposit']] }] }, 
                                        '$amount', 
                                        0
                                    ] 
                                }
                            },
                            paidIncome: {
                                $sum: { 
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'completed'] }, { $in: ['$paymentType', ['sale', 'seller_payment', 'security_deposit']] }] }, 
                                        '$amount', 
                                        0
                                    ] 
                                }
                            },
                            // Refunds (Deductions)
                            pendingRefunds: {
                                $sum: { 
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['refund', 'partial_refund']] }] }, 
                                        '$amount', 
                                        0
                                    ] 
                                }
                            },
                            collectedRefunds: {
                                $sum: { 
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'collected'] }, { $in: ['$paymentType', ['refund', 'partial_refund']] }] }, 
                                        '$amount', 
                                        0
                                    ] 
                                }
                            },
                            completedRefunds: {
                                $sum: { 
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'completed'] }, { $in: ['$paymentType', ['refund', 'partial_refund']] }] }, 
                                        '$amount', 
                                        0
                                    ] 
                                }
                            },
                            // Counts
                            pendingCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                            },
                            collectedCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'collected'] }, 1, 0] }
                            },
                            completedCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                            },
                            totalRefundCount: {
                                $sum: { $cond: [{ $in: ['$paymentType', ['refund', 'partial_refund']] }, 1, 0] }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            summary: {
                                income: {
                                    pending: '$pendingIncome',
                                    paid: '$paidIncome'
                                },
                                refunds: {
                                    pending: '$pendingRefunds',
                                    collected: '$collectedRefunds',
                                    completed: '$completedRefunds',
                                    totalPaid: { $add: ['$collectedRefunds', '$completedRefunds'] }
                                },
                                net: {
                                    pending: { $subtract: ['$pendingIncome', '$pendingRefunds'] },
                                    cleared: { $subtract: ['$paidIncome', { $add: ['$collectedRefunds', '$completedRefunds'] }] }
                                },
                                statusDistribution: {
                                    pending: '$pendingCount',
                                    collected: '$collectedCount',
                                    completed: '$completedCount'
                                },
                                totalRefunds: '$totalRefundCount'
                            }
                        }
                    }
                ]
            }
        });

        const result = await Order.aggregate(pipeline);

        const data = result[0].data || [];
        const finalSummary = result[0].stats[0]?.summary || {
            income: { pending: 0, paid: 0 },
            refunds: { pending: 0, collected: 0, completed: 0, totalPaid: 0 },
            net: { pending: 0, cleared: 0 },
            statusDistribution: { pending: 0, collected: 0, completed: 0 },
            totalRefunds: 0
        };

        res.json({
            success: true,
            data: data,
            // Hierarchical structure for new apps
            ...finalSummary,
            // Legacy support for older apps
            summary: {
                ...finalSummary,
                totalPending: finalSummary.net.pending,
                clearedAmount: finalSummary.net.cleared,
                refundCount: finalSummary.totalRefunds
            },
            totalEntries: data.length
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSellerPaymentTimeline
};
