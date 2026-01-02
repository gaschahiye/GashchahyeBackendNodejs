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

        // ✅ FILTER: Conditional Display for Security & Delivery
        // "Don't show Security Deposits and delivery fee until the order type is return"
        pipeline.push({
            $match: {
                $expr: {
                    $or: [
                        // Show if it's NOT Security or Delivery
                        {
                            $and: [
                                { $ne: ['$paymentTimeline.cause', 'Security Deposits'] },
                                { $ne: ['$paymentTimeline.type', 'delivery_fee'] }
                            ]
                        },
                        // OR Show if it IS Security/Delivery BUT Order Type is 'return'
                        {
                            $and: [
                                { $in: ['$orderType', ['return']] },
                                {
                                    $or: [
                                        { $eq: ['$paymentTimeline.cause', 'Security Deposits'] },
                                        { $eq: ['$paymentTimeline.type', 'delivery_fee'] }
                                    ]
                                }
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

        // Search Filter on Resolved Fields
        if (searchQuery) {
            pipeline.push({
                $match: {
                    $or: [
                        { 'orderId': { $regex: searchQuery, $options: 'i' } },
                        { 'resolvedPerson.name': { $regex: searchQuery, $options: 'i' } },
                        { 'resolvedPerson.phone': { $regex: searchQuery, $options: 'i' } }
                    ]
                }
            });
        }

        // Other Filters
        if (status) pipeline.push({ $match: { 'paymentTimeline.status': status } });
        if (type) pipeline.push({ $match: { 'paymentTimeline.type': type } });

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
                paymentType: '$paymentTimeline.type',
                amount: '$paymentTimeline.amount',
                paymentMethod: '$paymentTimeline.paymentMethod',
                status: '$paymentTimeline.status',
                date: '$paymentTimeline.createdAt',
                notes: '$paymentTimeline.cause',
                sellerId: { $toString: '$sellerInfo._id' },
                buyerId: { $toString: '$buyerInfo._id' },
                driverId: { $ifNull: [{ $toString: '$driver._id' }, null] },
                liabilityType: '$paymentTimeline.liabilityType',
                referenceId: '$paymentTimeline.referenceId',
                processedBy: '$paymentTimeline.processedBy',
                processedAt: '$paymentTimeline.processedAt',
                originalPaymentMethod: '$payment.method'
            }
        });

        pipeline.push({ $sort: { date: -1 } });

        // Facet for Stats and Data (no pagination - get all)
        pipeline.push({
            $facet: {
                data: [
                    { $match: {} } // Get all records
                ],
                stats: [
                    {
                        $group: {
                            _id: null,
                            totalPending: {
                                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
                            },
                            amountToDrivers: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $eq: ['$paymentType', 'delivery_fee'] }] },
                                        '$amount',
                                        0
                                    ]
                                }
                            },
                            amountToRefund: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['refund', 'partial_refund']] }] },
                                        '$amount',
                                        0
                                    ]
                                }
                            },
                            clearedAmount: {
                                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] }
                            },
                            pendingCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                            },
                            clearedCount: {
                                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                            }
                        }
                    }
                ]
            }
        });

        const result = await Order.aggregate(pipeline);

        const data = result[0].data || [];
        const statsObj = result[0].stats[0] || {
            totalPending: 0,
            amountToDrivers: 0,
            amountToRefund: 0,
            clearedAmount: 0,
            pendingCount: 0,
            clearedCount: 0
        };

        res.json({
            success: true,
            data: data,
            summary: {
                ...statsObj,
                statusDistribution: {
                    pending: statsObj.pendingCount,
                    completed: statsObj.clearedCount
                }
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
