const Order = require('../models/Order');
const mongoose = require('mongoose');
const exceljs = require('exceljs');

/**
 * Get Payment Timeline and Admin Revenue
 * @route GET /api/admin/payments
 */
const getPaymentTimeline = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            dateFrom,
            dateTo,
            status,
            type,
            searchQuery
        } = req.query;

        const query = {};

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

        // Initial filtering optimization
        if (Object.keys(query).length > 0) {
            pipeline.push({ $match: query });
        }

        pipeline.push({ $unwind: '$paymentTimeline' });

        // ✅ FILTER: Exclude payments without timelineId
        pipeline.push({
            $match: {
                'paymentTimeline.timelineId': { $exists: true, $ne: null, $ne: '' }
            }
        });

        // ✅ FILTER: Conditional Display for Security & Delivery
        // "Dont show Security Deposits and delivery fee unitl the order type is return"
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


        // Project Final Structure to match Flutter PaymentItem
        pipeline.push({
            $project: {
                _id: 0,
                id: '$paymentTimeline.timelineId',
                timelineId: '$paymentTimeline.timelineId', // Added explicit timelineId as requested
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

        // Facet for Stats and Data
        pipeline.push({
            $facet: {
                data: [
                    { $skip: (parseInt(page) - 1) * parseInt(limit) },
                    { $limit: parseInt(limit) }
                ],
                metadata: [
                    { $count: 'total' },
                    { $addFields: { page: parseInt(page), limit: parseInt(limit) } }
                ],
                stats: [
                    {
                        $group: {
                            _id: null,
                            totalPending: {
                                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] }
                            },
                            amountToSellers: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['sale', 'seller_payment']] }] },
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
                            },
                            pendingSellerPayments: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['sale', 'seller_payment']] }] },
                                        '$amount',
                                        0
                                    ]
                                }
                            },
                            pendingRefunds: {
                                $sum: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'pending'] }, { $in: ['$paymentType', ['refund', 'partial_refund']] }] },
                                        '$amount',
                                        0
                                    ]
                                }
                            }
                        }
                    }
                ]
            }
        });

        const result = await Order.aggregate(pipeline);

        const data = result[0].data || [];
        const metadata = result[0].metadata[0] || { total: 0, page, limit };
        const statsObj = result[0].stats[0] || {
            totalPending: 0,
            amountToSellers: 0,
            amountToRefund: 0,
            clearedAmount: 0,
            pendingCount: 0,
            clearedCount: 0,
            pendingSellerPayments: 0,
            pendingRefunds: 0
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
            pagination: {
                currentPage: metadata.page,
                totalPages: Math.ceil(metadata.total / metadata.limit),
                totalEntries: metadata.total,
                hasNext: (metadata.page * metadata.limit) < metadata.total
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Clear a specific payment entry
 * @route POST /api/admin/payments/:timelineId/clear
 */
const clearPayment = async (req, res, next) => {
    try {
        const { timelineId } = req.params;
        const { referenceId, notes } = req.body;

        const order = await Order.findOne({ 'paymentTimeline.timelineId': timelineId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Payment entry not found' });
        }

        const timelineEntry = order.paymentTimeline.find(t => t.timelineId === timelineId);

        if (timelineEntry.status === 'completed') {
            return res.status(400).json({ success: false, message: 'Payment is already cleared' });
        }

        timelineEntry.status = 'completed';
        timelineEntry.processedBy = req.user.fullName; // Assuming Auth Middleware populates user
        timelineEntry.processedAt = new Date();
        if (referenceId) timelineEntry.referenceId = referenceId;
        if (notes) timelineEntry.cause = notes; // Append or unused cause/notes field

        // If it was a 'delivery_fee', update driver earnings too
        if (timelineEntry.type === 'delivery_fee') {
            const earning = order.driverEarnings.find(e => e.driver.toString() === timelineEntry.driverId?.toString() && e.status === 'pending');
            // Simplification: find matching earning by amount/driver or link better in future. 
            // Currently Order model separates them. We try to find a pending one.
            if (earning) {
                earning.status = 'paid';
            }
        }

        await order.save();

        // ✅ Sync status to Google Sheet
        const GoogleSheetService = require('../services/googleSheet.service');
        await GoogleSheetService.updateStatusInSheet(timelineId, 'completed', referenceId);

        res.json({
            success: true,
            message: 'Payment cleared successfully',
            payment: timelineEntry
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Export Payments to Excel
 * @route GET /api/admin/payments/export
 */
const exportPayments = async (req, res, next) => {
    try {
        const pipeline = [{ $unwind: '$paymentTimeline' }];

        // Allow both pending and completed for the ledger view
        pipeline.push({ $match: { 'paymentTimeline.status': { $in: ['pending', 'completed'] } } });

        // ✅ FILTER: Exclude payments without timelineId
        pipeline.push({
            $match: {
                'paymentTimeline.timelineId': { $exists: true, $ne: null, $ne: '' }
            }
        });

        // ✅ FILTER: Conditional Display for Security & Delivery
        pipeline.push({
            $match: {
                $expr: {
                    $or: [
                        {
                            $and: [
                                { $ne: ['$paymentTimeline.cause', 'Security Deposits'] },
                                { $ne: ['$paymentTimeline.type', 'delivery_fee'] }
                            ]
                        },
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

        // Resolve Person Name/Type
        pipeline.push({
            $addFields: {
                resolvedPerson: {
                    $switch: {
                        branches: [
                            {
                                case: { $eq: ['$paymentTimeline.type', 'delivery_fee'] },
                                then: { name: '$driver.fullName', type: 'driver', phone: '$driver.phoneNumber' }
                            },
                            {
                                case: { $in: ['$paymentTimeline.type', ['sale', 'seller_payment']] },
                                then: { name: '$sellerInfo.businessName', type: 'seller', phone: '$sellerInfo.phoneNumber' }
                            },
                            {
                                case: { $in: ['$paymentTimeline.type', ['refund', 'partial_refund']] },
                                then: { name: '$buyerInfo.fullName', type: 'buyer', phone: '$buyerInfo.phoneNumber' }
                            }
                        ],
                        default: { name: 'Unknown', type: 'other', phone: '' }
                    }
                }
            }
        });

        // Project Final Structure
        pipeline.push({
            $project: {
                _id: 0,
                timelineId: '$paymentTimeline.timelineId',
                orderId: '$orderId',
                date: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$paymentTimeline.createdAt" } },

                personName: { $ifNull: ['$resolvedPerson.name', 'N/A'] },
                personType: '$resolvedPerson.type',
                personPhone: { $ifNull: ['$resolvedPerson.phone', 'N/A'] },

                type: '$paymentTimeline.type',
                details: '$paymentTimeline.cause',
                liabilityType: '$paymentTimeline.liabilityType',

                amount: '$paymentTimeline.amount',
                paymentMethod: '$paymentTimeline.paymentMethod',
                status: '$paymentTimeline.status',

                referenceId: '$paymentTimeline.referenceId',

                // Fields for import convenience
                systemId: '$paymentTimeline.timelineId'
            }
        });

        pipeline.push({ $sort: { date: -1 } });

        const payments = await Order.aggregate(pipeline);

        // Separate Pending and Completed (Case-Insensitive)
        const pendingPayments = payments.filter(p => p.status?.toLowerCase() === 'pending');
        const completedPayments = payments.filter(p => p.status?.toLowerCase() === 'completed');

        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('GasChahye Ledger');

        // --- 1. Branding & Title ---
        worksheet.mergeCells('A1:L1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'GasChahye Financial Ledger';
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Slate
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // --- 2. Summary Formulas (Top Section) ---
        worksheet.mergeCells('A2:L2'); // Spacer

        worksheet.getCell('B3').value = 'Summary Overview';
        worksheet.getCell('B3').font = { bold: true };

        worksheet.getCell('B4').value = 'Total Pending:';
        worksheet.getCell('C4').value = { formula: 'SUMIF(J:J,"pending",I:I)' };

        worksheet.getCell('B5').value = 'Total Cleared:';
        worksheet.getCell('C5').value = { formula: 'SUMIF(J:J,"completed",I:I)' };

        worksheet.getCell('E4').value = 'Generated On:';
        worksheet.getCell('F4').value = new Date();

        // Style Summary
        ['B4', 'B5', 'E4'].forEach(cell => worksheet.getCell(cell).font = { bold: true });

        // --- Helper Function to Create Table ---
        const createTable = (startRow, title, data, headerColor) => {
            // Table Title
            const titleRow = worksheet.getRow(startRow);
            titleRow.getCell(1).value = title;
            titleRow.getCell(1).font = { size: 12, bold: true, color: { argb: 'FF000000' } };
            // worksheet.mergeCells(`A${startRow}:L${startRow}`);

            const headerRowIndex = startRow + 1;
            const columns = [
                { header: 'Date', key: 'date', width: 20 },
                { header: 'Order ID', key: 'orderId', width: 22 },
                { header: 'Person', key: 'personName', width: 25 },
                { header: 'Person Type', key: 'personType', width: 12 },
                { header: 'Phone', key: 'personPhone', width: 15 },
                { header: 'Tx Type', key: 'type', width: 15 },
                { header: 'Liability', key: 'liabilityType', width: 15 },
                { header: 'Details', key: 'details', width: 30 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Reference ID', key: 'referenceId', width: 25 },
                { header: 'System ID', key: 'systemId', width: 30 }
            ];

            // Set Headers
            columns.forEach((col, index) => {
                const cell = worksheet.getCell(headerRowIndex, index + 1);
                cell.value = col.header;
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
                cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
                worksheet.getColumn(index + 1).width = col.width;
            });

            // Populate Data
            let currentRow = headerRowIndex + 1;
            data.forEach(p => {
                const row = worksheet.getRow(currentRow);
                row.getCell(1).value = p.date;
                row.getCell(2).value = p.orderId;
                row.getCell(3).value = p.personName;
                row.getCell(4).value = p.personType;
                row.getCell(5).value = p.personPhone;
                row.getCell(6).value = p.type;
                row.getCell(7).value = p.liabilityType;
                row.getCell(8).value = p.details;
                row.getCell(9).value = p.amount;
                row.getCell(10).value = p.status;
                row.getCell(11).value = p.referenceId;
                row.getCell(12).value = p.systemId;

                // Status Styling
                const statusCell = row.getCell(10);
                if (p.status === 'pending') {
                    statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
                } else if (p.status === 'completed') {
                    statusCell.font = { color: { argb: 'FF16A34A' }, bold: true };
                }

                // Zebra Striping relative to table
                if ((currentRow - headerRowIndex) % 2 === 0) {
                    row.eachCell({ includeEmpty: true }, (cell) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                    });
                }

                // Add Dropdown to Status
                statusCell.dataValidation = {
                    type: 'list',
                    allowBlank: false,
                    formulae: ['"pending,completed"'],
                    showErrorMessage: true,
                    errorStyle: 'stop',
                    errorTitle: 'Invalid Status',
                    error: 'Status must be either "pending" or "completed"'
                };

                currentRow++;
            });

            return currentRow; // Return next available row
        };

        // --- 3. Render Tables ---

        let nextRow = 7;

        // PENDING TABLE (Orange Header)
        if (pendingPayments.length > 0) { // Render even if empty? User might prefer seeing the section. Let's render always or just if data. 
            // Better to always show headers so they know it exists.
        }
        nextRow = createTable(nextRow, 'PENDING PAYMENTS', pendingPayments, 'FFEA580C'); // Orange

        nextRow += 2; // Spacer

        // COMPLETED TABLE (Green Header or Blue? Blue for distinction)
        nextRow = createTable(nextRow, 'COMPLETED HISTORY', completedPayments, 'FF0F172A'); // Dark Blue

        // --- 4. Protection & Locking ---
        // Protect the sheet with a password (optional, or empty string for no pass but active protection)
        // This makes all cells Read-Only by default unless explicitly unlocked.
        await worksheet.protect('GasChahyeSecret', {
            selectLockedCells: true,
            selectUnlockedCells: true,
            formatCells: true,
            formatColumns: true,
            formatRows: true,
            sort: true,
            autoFilter: true,
        });

        // Unlock Editable Columns for the rows we created
        // Columns 10 (Status) and 11 (Reference ID) should be editable.
        // We iterate from row 8 (first data row) to nextRow (last row used).
        for (let i = 8; i < nextRow; i++) {
            const row = worksheet.getRow(i);

            // Unlock Status (10) and Reference ID (11) if it's a data row
            // (Check if row has values to avoid unlocking spacer rows)
            if (row.getCell(1).value) {
                row.getCell(10).protection = { locked: false }; // Status
                row.getCell(11).protection = { locked: false }; // Reference ID
            }
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=GasChahye_Ledger.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        next(error);
    }
};

/**
 * Import Payments from Excel (Update Status)
 * @route POST /api/admin/payments/import
 */
const importPayments = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const workbook = new exceljs.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1); // Assume first sheet

        const updates = [];

        // Iterate all rows to find data
        // We know System ID is in Column 12
        // Status is in Column 10
        // Reference ID is in Column 11

        worksheet.eachRow((row, rowNumber) => {
            const systemIdCell = row.getCell(12);
            const systemId = systemIdCell.value ? systemIdCell.value.toString().trim() : null;

            // Basic validation to check if it's a data row and not a header row
            // Header content for Col 12 is 'System ID'
            if (systemId && systemId !== 'System ID' && systemId.length > 5) {

                const statusCell = row.getCell(10);
                const status = statusCell.value ? statusCell.value.toString().toLowerCase().trim() : null;

                const refIdCell = row.getCell(11);
                const refId = refIdCell.value ? refIdCell.value.toString().trim() : null;

                if (status && ['pending', 'completed'].includes(status)) {
                    updates.push({
                        timelineId: systemId,
                        status: status,
                        referenceId: refId || ''
                    });
                }
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid payment rows found in the uploaded file.' });
        }

        let successCount = 0;

        const updatePromises = updates.map(async (update) => {
            const order = await Order.findOne({ 'paymentTimeline.timelineId': update.timelineId });

            if (order) {
                const paymentEntry = order.paymentTimeline.find(p => p.timelineId === update.timelineId);

                if (paymentEntry) {
                    // Check for changes
                    const statusChanged = paymentEntry.status !== update.status;
                    const refChanged = update.referenceId && paymentEntry.referenceId !== update.referenceId;

                    if (statusChanged || refChanged) {
                        paymentEntry.status = update.status;
                        if (update.referenceId) {
                            paymentEntry.referenceId = update.referenceId;
                        }

                        // If marking as completed, set metadata
                        if (update.status === 'completed' && !paymentEntry.processedAt) {
                            paymentEntry.processedAt = new Date();
                            if (req.user && req.user._id) {
                                paymentEntry.processedBy = req.user._id;
                            }
                        }

                        await order.save();
                        successCount++;
                    }
                }
            }
        });

        await Promise.all(updatePromises);

        return res.status(200).json({
            success: true,
            message: `Processed ${updates.length} rows. Updated ${successCount} payments.`,
            meta: {
                totalRowsFound: updates.length,
                updated: successCount
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Internal logic to Sync Payments from Google Sheet
 * Used by both the API route and the Background Heartbeat
 */
const syncGoogleSheetInternal = async (userId = null) => {
    const GoogleSheetService = require('../services/googleSheet.service');
    const rows = await GoogleSheetService.getPaymentRows();

    if (rows.length === 0) return { updated: 0, scanned: 0 };

    let successCount = 0;
    const updates = [];

    // Parse Sheet Rows
    rows.forEach(row => {
        const systemId = row.get('System ID');
        const status = row.get('Status');
        const refId = row.get('Reference ID');

        if (systemId && systemId.length > 5 && ['pending', 'completed'].includes(status?.toLowerCase())) {
            updates.push({
                timelineId: systemId,
                status: status.toLowerCase(),
                referenceId: refId || ''
            });
        }
    });

    const updatePromises = updates.map(async (update) => {
        const order = await Order.findOne({ 'paymentTimeline.timelineId': update.timelineId });
        if (order) {
            const paymentEntry = order.paymentTimeline.find(p => p.timelineId === update.timelineId);
            if (paymentEntry) {
                const statusChanged = paymentEntry.status !== update.status;
                const refChanged = update.referenceId && paymentEntry.referenceId !== update.referenceId;

                if (statusChanged || refChanged) {
                    paymentEntry.status = update.status;
                    if (update.referenceId) paymentEntry.referenceId = update.referenceId;

                    if (update.status === 'completed' && !paymentEntry.processedAt) {
                        paymentEntry.processedAt = new Date();
                        if (userId) paymentEntry.processedBy = userId;
                    }

                    await order.save();
                    successCount++;
                }
            }
        }
    });

    await Promise.all(updatePromises);

    let finalSheetCount = 0;
    if (successCount > 0) {
        finalSheetCount = await _rebuildSheetLogic();
    }

    return {
        updated: successCount,
        scanned: rows.length,
        valid: updates.length,
        newSheetRowCount: finalSheetCount || rows.length
    };
};

/**
 * Sync Payments from Google Sheet (Pull Updates)
 * @route POST /api/admin/payments/sync
 */
const syncGoogleSheet = async (req, res, next) => {
    try {
        const result = await syncGoogleSheetInternal(req.user ? req.user._id : null);

        if (result.scanned === 0) {
            return res.status(200).json({
                success: true,
                message: 'No rows found in Google Sheet or sync disabled.',
                meta: { updated: 0 }
            });
        }

        return res.status(200).json({
            success: true,
            message: `Synced ${result.valid} rows from Google Sheet. Updated ${result.updated} payments. ${result.updated > 0 ? 'Sheet auto-refreshed.' : ''}`,
            meta: {
                totalRowsScanned: result.scanned,
                validRows: result.valid,
                updated: result.updated,
                newSheetRowCount: result.newSheetRowCount
            }
        });
    } catch (error) {
        return next(error);
    }
};

/**
 * Completely rebuild Google Sheet from Database
 * @route POST /api/admin/payments/rebuild-sheet
 */
const rebuildSheet = async (req, res, next) => {
    try {
        const count = await _rebuildSheetLogic();
        return res.status(200).json({
            success: true,
            message: `Successfully rebuilt Google Sheet with ${count} rows.`,
            count
        });
    } catch (error) {
        next(error);
    }
};

// Internal helper to avoid code duplication and allow calling from other exports
const _rebuildSheetLogic = async () => {
    const GoogleSheetService = require('../services/googleSheet.service');

    const pipeline = [{ $unwind: '$paymentTimeline' }];
    pipeline.push({ $match: { 'paymentTimeline.status': { $in: ['pending', 'completed'] } } });
    pipeline.push({ $match: { 'paymentTimeline.timelineId': { $exists: true, $ne: null, $ne: '' } } });

    pipeline.push({
        $match: {
            $expr: {
                $or: [
                    { $and: [{ $ne: ['$paymentTimeline.cause', 'Security Deposits'] }, { $ne: ['$paymentTimeline.type', 'delivery_fee'] }] },
                    { $and: [{ $in: ['$orderType', ['return']] }, { $or: [{ $eq: ['$paymentTimeline.cause', 'Security Deposits'] }, { $eq: ['$paymentTimeline.type', 'delivery_fee'] }] }] }
                ]
            }
        }
    });

    pipeline.push({ $lookup: { from: 'users', localField: 'paymentTimeline.driverId', foreignField: '_id', as: 'driverDetails' } });
    pipeline.push({ $lookup: { from: 'users', localField: 'seller', foreignField: '_id', as: 'sellerDetails' } });
    pipeline.push({ $lookup: { from: 'users', localField: 'buyer', foreignField: '_id', as: 'buyerDetails' } });
    pipeline.push({ $addFields: { driver: { $arrayElemAt: ['$driverDetails', 0] }, sellerInfo: { $arrayElemAt: ['$sellerDetails', 0] }, buyerInfo: { $arrayElemAt: ['$buyerDetails', 0] } } });

    pipeline.push({
        $addFields: {
            resolvedPerson: {
                $switch: {
                    branches: [
                        { case: { $eq: ['$paymentTimeline.type', 'delivery_fee'] }, then: { name: '$driver.fullName', type: 'driver', phone: '$driver.phoneNumber' } },
                        { case: { $in: ['$paymentTimeline.type', ['sale', 'seller_payment']] }, then: { name: '$sellerInfo.businessName', type: 'seller', phone: '$sellerInfo.phoneNumber' } },
                        { case: { $in: ['$paymentTimeline.type', ['refund', 'partial_refund']] }, then: { name: '$buyerInfo.fullName', type: 'buyer', phone: '$buyerInfo.phoneNumber' } }
                    ],
                    default: { name: 'Unknown', type: 'other', phone: '' }
                }
            }
        }
    });

    pipeline.push({
        $project: {
            _id: 0,
            systemId: '$paymentTimeline.timelineId',
            orderId: '$orderId',
            date: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$paymentTimeline.createdAt" } },
            personName: { $ifNull: ['$resolvedPerson.name', 'N/A'] },
            personType: '$resolvedPerson.type',
            personPhone: { $ifNull: ['$resolvedPerson.phone', 'N/A'] },
            type: '$paymentTimeline.type',
            details: '$paymentTimeline.cause',
            liabilityType: '$paymentTimeline.liabilityType',
            amount: '$paymentTimeline.amount',
            status: '$paymentTimeline.status',
            referenceId: { $ifNull: ['$paymentTimeline.referenceId', ''] }
        }
    });

    const payments = await Order.aggregate(pipeline);
    await GoogleSheetService.syncAllToSheet(payments);
    return payments.length;
};

/**
 * Webhook for Google Apps Script to trigger a specific row sync
 * @route POST /api/admin/payments/sync-webhook
 */
const syncGoogleSheetWebhook = async (req, res, next) => {
    try {
        console.log('--- [Webhook Entry] ---');
        console.log('Request Body:', JSON.stringify(req.body, null, 2));

        const { systemId, status, referenceId } = req.body;

        if (!systemId) {
            console.warn('[Webhook] Rejected: Missing systemId');
            return res.status(400).json({ success: false, message: 'Missing systemId' });
        }

        console.log(`[Webhook] Searching for timelineId: ${systemId}`);

        const order = await Order.findOne({ 'paymentTimeline.timelineId': systemId });
        if (!order) {
            console.error(`[Webhook] Failed: No order found with timelineId ${systemId}`);
            return res.status(404).json({ success: false, message: 'Payment entry not found' });
        }

        const paymentEntry = order.paymentTimeline.find(p => p.timelineId === systemId);
        if (!paymentEntry) {
            console.error(`[Webhook] Failed: Entry found in DB but not in order ${order.orderId}`);
            return res.status(404).json({ success: false, message: 'Entry not found in order' });
        }

        let updated = false;
        console.log(`[Webhook] Found Entry. Current Status: ${paymentEntry.status}, New Status: ${status}`);

        // Update status if provided and different
        if (status && ['pending', 'completed'].includes(status.toLowerCase())) {
            const newStatus = status.toLowerCase();
            if (paymentEntry.status !== newStatus) {
                console.log(`[Webhook] Changing status ${paymentEntry.status} -> ${newStatus}`);
                paymentEntry.status = newStatus;
                updated = true;

                // Handle processing dates/users for completion
                if (newStatus === 'completed' && !paymentEntry.processedAt) {
                    paymentEntry.processedAt = new Date();
                }
            }
        }

        // Update reference ID if provided
        if (referenceId !== undefined && paymentEntry.referenceId !== referenceId) {
            console.log(`[Webhook] Changing Reference ID ${paymentEntry.referenceId || 'empty'} -> ${referenceId}`);
            paymentEntry.referenceId = referenceId;
            updated = true;
        }

        if (updated) {
            await order.save();
            console.log(`[Webhook] ✅ Successfully updated DB for ${systemId}`);

            // Rebuild the sheet to reflect changes (move rows between tabs if needed)
            console.log(`[Webhook] Triggering Sheet Rebuild to align tabs...`);
            await _rebuildSheetLogic();
        } else {
            console.log(`[Webhook] ℹ️ No changes detected for ${systemId}`);
        }

        console.log('--- [Webhook Exit] ---');
        return res.status(200).json({
            success: true,
            updated,
            message: updated ? 'Database and Sheet synchronized' : 'No changes detected'
        });
    } catch (error) {
        console.error('[Webhook Error]', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// --- EXPORTS ---
exports.getPaymentTimeline = getPaymentTimeline;
exports.clearPayment = clearPayment;
exports.exportPayments = exportPayments;
exports.importPayments = importPayments;
exports.syncGoogleSheet = syncGoogleSheet;
exports.syncGoogleSheetInternal = syncGoogleSheetInternal;
exports.rebuildSheet = rebuildSheet;
exports.syncGoogleSheetWebhook = syncGoogleSheetWebhook;
exports._rebuildSheetLogic = _rebuildSheetLogic;

