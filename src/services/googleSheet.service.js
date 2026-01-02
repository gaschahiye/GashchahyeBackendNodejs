const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const LEDGER_HEADERS = ['Date', 'Order ID', 'Person', 'Person Type', 'Phone', 'Tx Type', 'Liability', 'Details', 'Amount', 'Status', 'Reference ID', 'System ID'];
const STATUS_ENUMS = ['pending', 'completed'];
const TYPE_ENUMS = ['pickup_fee', 'delivery_fee', 'refund', 'sale', 'other'];
const LIABILITY_ENUMS = ['revenue', 'liability', 'refundable'];


class GoogleSheetService {
    constructor() {
        this.doc = null;
        this.sheetId = process.env.GOOGLE_SHEET_ID;
        this.clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
    }

    async initialize() {
        if (!this.sheetId || !this.clientEmail || !this.privateKey) {
            console.warn('Google Sheet credentials missing. Sync disabled.');
            return false;
        }

        try {
            const serviceAccountAuth = new JWT({
                email: this.clientEmail,
                key: this.privateKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(this.sheetId, serviceAccountAuth);
            await doc.loadInfo();
            this.doc = doc; // Only assign after success
            return true;
        } catch (error) {
            this.doc = null; // Reset on failure so we try again next time
            console.error('Google Sheet Initialization Failed:', error.message);
            return false;
        }
    }

    async getSheetByTitle(title) {
        if (!this.doc) await this.initialize();
        if (!this.doc) return null;
        let sheet = this.doc.sheetsByTitle[title];
        if (!sheet) {
            sheet = await this.doc.addSheet({ title });
        }
        return sheet;
    }

    /**
     * Ensures headers and basic layout are present
     */
    async _ensureHeaders(sheet, title) {
        try {
            await sheet.loadHeaderRow(8);
            if (!sheet.headerValues || sheet.headerValues.length === 0) {
                await this._setupProfessionalHeader(sheet, title, []);
            }
        } catch (e) {
            await this._setupProfessionalHeader(sheet, title, []);
        }
    }

    async addPaymentRow(data) {
        try {
            const isCompleted = data.status?.toLowerCase() === 'completed';
            const sheetTitle = isCompleted ? 'Completed History' : 'Live Ledger';
            const sheet = await this.getSheetByTitle(sheetTitle);
            if (!sheet) return;

            await this._ensureHeaders(sheet, `GasChahye ${sheetTitle}`);

            const row = await sheet.addRow({
                'Date': data.date,
                'Order ID': data.orderId,
                'Person': data.personName,
                'Person Type': data.personType,
                'Phone': data.personPhone,
                'Tx Type': data.type,
                'Liability': data.liabilityType,
                'Details': data.details,
                'Amount': data.amount,
                'Status': data.status,
                'Reference ID': data.referenceId || '',
                'System ID': data.timelineId
            });

            // Apply Dropdown Validation (Status, Type, Liability) and Column Formatting
            const rowNumber = row.rowNumber;
            await sheet.loadCells(`F${rowNumber}:J${rowNumber}`);

            // Amount (I / index 8)
            const amountCell = sheet.getCell(rowNumber - 1, 8);
            amountCell.numberFormat = { type: 'NUMBER', pattern: '#,##0.00' };

            // Tx Type (F / index 5)
            const typeCell = sheet.getCell(rowNumber - 1, 5);
            typeCell.dataValidation = { condition: { type: 'ONE_OF_LIST', values: TYPE_ENUMS.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true };

            // Liability (G / index 6)
            const liabilityCell = sheet.getCell(rowNumber - 1, 6);
            liabilityCell.dataValidation = { condition: { type: 'ONE_OF_LIST', values: LIABILITY_ENUMS.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true };

            // Status (J / index 9)
            const statusCell = sheet.getCell(rowNumber - 1, 9);
            statusCell.dataValidation = { condition: { type: 'ONE_OF_LIST', values: STATUS_ENUMS.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true };

            await sheet.saveUpdatedCells();

            console.log(`[Sheet] Row added to ${sheetTitle} with enums`);
        } catch (error) {
            console.error('Failed to add row to Google Sheet:', error.message);
        }
    }

    async getPaymentRows() {
        try {
            const sheet = await this.getSheetByTitle('Live Ledger');
            if (!sheet) return [];
            await this._ensureHeaders(sheet, 'GasChahye Live Ledger');
            return await sheet.getRows();
        } catch (error) {
            console.error('Failed to fetch rows from Google Sheet:', error.message);
            return [];
        }
    }

    async updateStatusInSheet(timelineId, status, referenceId) {
        try {
            const liveSheet = await this.getSheetByTitle('Live Ledger');
            if (!liveSheet) return;
            await this._ensureHeaders(liveSheet, 'GasChahye Live Ledger');
            const rows = await liveSheet.getRows();

            const rowIndex = rows.findIndex(r => r.get('System ID') === timelineId);
            if (rowIndex !== -1) {
                const row = rows[rowIndex];

                // If moving to completed, move to other tab
                if (status === 'completed') {
                    const rowData = {
                        date: row.get('Date'),
                        orderId: row.get('Order ID'),
                        personName: row.get('Person'),
                        personType: row.get('Person Type'),
                        personPhone: row.get('Phone'),
                        type: row.get('Tx Type'),
                        liabilityType: row.get('Liability'),
                        details: row.get('Details'),
                        amount: row.get('Amount'),
                        status: 'completed',
                        referenceId: referenceId || row.get('Reference ID'),
                        timelineId: timelineId
                    };

                    // Add to History
                    await this.addPaymentRow(rowData);

                    // Delete from Live
                    await row.delete();
                    console.log(`[Sheet] Moved ${timelineId} from Live to Completed History`);
                } else {
                    // Just update in place if still pending or other
                    row.set('Status', status);
                    if (referenceId) row.set('Reference ID', referenceId);
                    await row.save();
                    console.log(`[Sheet] Updated status for ${timelineId} in Live Ledger`);
                }
            }
        } catch (error) {
            console.error('Failed to update status in Google Sheet:', error.message);
        }
    }

    async syncAllToSheet(payments) {
        try {
            if (!this.doc) await this.initialize();
            if (!this.doc) return;

            const pendingPayments = payments.filter(p => p.status?.toLowerCase() === 'pending');
            const completedPayments = payments.filter(p => p.status?.toLowerCase() === 'completed');

            // --- 1. SETUP LIVE LEDGER ---
            const liveSheet = await this.getSheetByTitle('Live Ledger');
            await liveSheet.clear();
            await this._setupProfessionalHeader(liveSheet, 'GasChahye Live Ledger', pendingPayments);

            // --- 2. SETUP COMPLETED HISTORY ---
            const historySheet = await this.getSheetByTitle('Completed History');
            await historySheet.clear();
            await this._setupProfessionalHeader(historySheet, 'GasChahye Completed History', completedPayments);

            console.log(`[Sheet] Rebuilt both tabs with ${pendingPayments.length} pending and ${completedPayments.length} completed entries.`);
        } catch (error) {
            console.error('Failed to sync all to Google Sheet:', error.message);
        }
    }

    // Helper for professional layout
    async _setupProfessionalHeader(sheet, title, data) {
        try {
            // Ensure sheet has enough rows for the data and dropdowns (e.g., 2500 total)
            if (sheet.rowCount < 2500) {
                await sheet.updateProperties({ gridProperties: { rowCount: 2500 } });
            }

            // Load header/summary range first
            await sheet.loadCells('A1:L20');

            // --- 1. TITLE SECTION ---
            const titleCell = sheet.getCell(0, 0);
            titleCell.value = title;
            titleCell.textFormat = { bold: true, fontSize: 18, foregroundColor: { red: 1, green: 1, blue: 1 } };
            titleCell.backgroundColor = { red: 0.12, green: 0.16, blue: 0.23 };
            titleCell.horizontalAlignment = 'CENTER';
            titleCell.verticalAlignment = 'MIDDLE';

            try {
                await sheet.mergeCells({ startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 });
            } catch (mergeErr) { }

            // --- 2. SUMMARY SECTION ---
            const isLive = title.toLowerCase().includes('live');
            const summaryTitle = sheet.getCell(2, 1);
            summaryTitle.value = '📋 FINANCIAL OVERVIEW';
            summaryTitle.textFormat = { bold: true, fontSize: 13, foregroundColor: { red: 0.93, green: 0.35, blue: 0.05 } };

            sheet.getCell(3, 1).value = isLive ? 'PAID / CLEARED (Expected):' : 'TOTAL CLEARED:';
            sheet.getCell(3, 1).textFormat = { bold: true };
            sheet.getCell(3, 3).formula = '=SUMIF(J9:J2000, "completed", I9:I2000)';
            sheet.getCell(3, 3).numberFormat = { type: 'NUMBER', pattern: '#,##0.00' };
            sheet.getCell(3, 3).textFormat = { foregroundColor: { red: 0.08, green: 0.64, blue: 0.29 }, bold: true };

            sheet.getCell(4, 1).value = isLive ? 'TOTAL PENDING:' : 'STILL PENDING (Mistake?):';
            sheet.getCell(4, 1).textFormat = { bold: true };
            sheet.getCell(4, 3).formula = '=SUMIF(J9:J2000, "pending", I9:I2000)';
            sheet.getCell(4, 3).numberFormat = { type: 'NUMBER', pattern: '#,##0.00' };
            sheet.getCell(4, 3).textFormat = { foregroundColor: { red: 0.86, green: 0.15, blue: 0.15 }, bold: true };

            sheet.getCell(5, 1).value = 'ITEM COUNT:';
            sheet.getCell(5, 1).textFormat = { bold: true };
            sheet.getCell(5, 3).value = data?.length || 0;

            sheet.getCell(3, 10).value = 'System Status:';
            sheet.getCell(3, 11).value = 'Synchronized ✅';
            sheet.getCell(4, 10).value = 'Last Refresh:';
            sheet.getCell(4, 11).value = new Date().toLocaleString();
            [sheet.getCell(3, 10), sheet.getCell(4, 10)].forEach(c => c.textFormat = { bold: true, italic: true });

            await sheet.saveUpdatedCells();

            // --- 3. HEADER ROW ---
            await sheet.setHeaderRow(LEDGER_HEADERS, 8);
            await sheet.loadCells('A8:L8');
            for (let i = 0; i < 12; i++) {
                const cell = sheet.getCell(7, i);
                cell.backgroundColor = { red: 0.91, green: 0.41, blue: 0.05 };
                cell.textFormat = { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } };
                cell.horizontalAlignment = 'CENTER';
                cell.verticalAlignment = 'MIDDLE';
            }
            await sheet.saveUpdatedCells();

            // --- 4. DATA POPULATION ---
            if (data && data.length > 0) {
                const rowsToPush = data.map(p => ({
                    'Date': p.date,
                    'Order ID': p.orderId,
                    'Person': p.personName,
                    'Person Type': p.personType,
                    'Phone': p.personPhone,
                    'Tx Type': p.type,
                    'Liability': p.liabilityType,
                    'Details': p.details,
                    'Amount': p.amount,
                    'Status': p.status,
                    'Reference ID': p.referenceId || '',
                    'System ID': p.systemId || p.timelineId // Support both formats
                }));
                await sheet.addRows(rowsToPush);
            }

            // --- 5. PREMIUM STYLING & INTERACTIVITY ---
            // --- 5. PREMIUM STYLING & INTERACTIVITY ---
            const dataRange = Math.max((data?.length || 0), 2000); // Apply to a large range for manual edits too

            // Format Amount Column (I) as Number and Apply Dropdowns
            await sheet.loadCells(`F9:J${9 + dataRange}`);
            for (let i = 0; i < dataRange; i++) {
                const rowIdx = 8 + i;

                // Column I: Amount (Formatting - Number without dollar sign)
                sheet.getCell(rowIdx, 8).numberFormat = { type: 'NUMBER', pattern: '#,##0.00' };

                // Column F: Tx Type (Dropdown)
                sheet.getCell(rowIdx, 5).dataValidation = {
                    condition: { type: 'ONE_OF_LIST', values: TYPE_ENUMS.map(v => ({ userEnteredValue: v })) },
                    showCustomUi: true, strict: true
                };

                // Column G: Liability (Dropdown)
                sheet.getCell(rowIdx, 6).dataValidation = {
                    condition: { type: 'ONE_OF_LIST', values: LIABILITY_ENUMS.map(v => ({ userEnteredValue: v })) },
                    showCustomUi: true, strict: true
                };

                // Column J: Status (Dropdown)
                sheet.getCell(rowIdx, 9).dataValidation = {
                    condition: { type: 'ONE_OF_LIST', values: STATUS_ENUMS.map(v => ({ userEnteredValue: v })) },
                    showCustomUi: true, strict: true
                };
            }
            await sheet.saveUpdatedCells();

            // --- 6. ADVANCED STYLING BATCH (Alternating Colors & Conditional Formatting) ---
            await this.doc.auth.request({
                url: `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}:batchUpdate`,
                method: 'POST',
                data: {
                    requests: [
                        // Alternating Colors (Banding)
                        {
                            addBanding: {
                                bandingProperties: {
                                    range: { sheetId: sheet.sheetId, startRowIndex: 8, endRowIndex: 8 + dataRange, startColumnIndex: 0, endColumnIndex: 12 },
                                    rowProperties: {
                                        headerColor: { red: 0.91, green: 0.41, blue: 0.05 },
                                        firstBandColor: { red: 1, green: 1, blue: 1 },
                                        secondBandColor: { red: 0.95, green: 0.96, blue: 0.98 }
                                    }
                                }
                            }
                        },
                        // Status Coloring (Completed=Green, Pending=Red)
                        {
                            addConditionalFormatRule: {
                                rule: {
                                    ranges: [{ sheetId: sheet.sheetId, startRowIndex: 8, endRowIndex: 8 + dataRange, startColumnIndex: 9, endColumnIndex: 10 }],
                                    booleanRule: {
                                        condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'completed' }] },
                                        format: { textFormat: { foregroundColor: { red: 0.08, green: 0.64, blue: 0.29 }, bold: true } }
                                    }
                                },
                                index: 0
                            }
                        },
                        {
                            addConditionalFormatRule: {
                                rule: {
                                    ranges: [{ sheetId: sheet.sheetId, startRowIndex: 8, endRowIndex: 8 + dataRange, startColumnIndex: 9, endColumnIndex: 10 }],
                                    booleanRule: {
                                        condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'pending' }] },
                                        format: { textFormat: { foregroundColor: { red: 0.86, green: 0.15, blue: 0.15 }, bold: true } }
                                    }
                                },
                                index: 1
                            }
                        }
                    ]
                }
            }).catch(() => { }); // Silent fail for banding collisions

            console.log(`[Sheet] Professional styling applied to ${title}`);
        } catch (error) {
            console.error(`Error setting up header for ${sheet.title}:`, error.message);
        }
    }

}

module.exports = new GoogleSheetService();
