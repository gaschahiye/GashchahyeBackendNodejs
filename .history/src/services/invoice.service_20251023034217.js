const PDFDocument = require('pdfkit');
const { bucket } = require('../config/firebase');
const logger = require('../utils/logger');

exports.generateInvoice = async (order) => {
  try {
    // PDF setup
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          const fileName = `invoices/${order.orderId}.pdf`;
          const file = bucket.file(fileName);

          await file.save(pdfBuffer, {
            metadata: { contentType: 'application/pdf' }
          });

          await file.makePublic();
          const invoiceUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

          resolve(invoiceUrl);
        } catch (error) {
          reject(error);
        }
      });

      // ---------------- PDF Content ----------------
      doc.fontSize(20).text('LPG INVOICE', { align: 'center' });
      doc.moveDown();

      doc.fontSize(10).text(`Invoice Number: ${order.invoiceNumber || 'N/A'}`);
      doc.text(`Order ID: ${order.orderId}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      // ---------------- Bill To ----------------
      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10);
      doc.text(order.buyer?.fullName || 'Customer Name');
      doc.text(order.buyer?.phoneNumber || 'Customer Phone');
      if (order.buyer?.email) doc.text(order.buyer.email);
      doc.text(order.buyer?.address || 'Customer Address');
      doc.moveDown();

      // ---------------- From ----------------
      doc.fontSize(12).text('From:', { underline: true });
      doc.fontSize(10);
      doc.text(order.seller?.name || 'Seller Name');
      doc.text(order.seller?.phoneNumber || 'Seller Phone');
      doc.text(order.seller?.address || 'Seller Address');
      doc.moveDown();

      // ---------------- Table ----------------
      const tableTop = doc.y;
      doc.fontSize(10);

      doc.text('Item', 50, tableTop, { width: 200 });
      doc.text('Qty', 250, tableTop, { width: 50 });
      doc.text('Price', 300, tableTop, { width: 100, align: 'right' });
      doc.text('Total', 400, tableTop, { width: 100, align: 'right' });

      doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();

      let yPosition = tableTop + 25;

      // Main Cylinder
      doc.text(`LPG Cylinder ${order.cylinderSize}`, 50, yPosition, { width: 200 });
      doc.text(order.quantity?.toString() || '0', 250, yPosition, { width: 50 });
      const unitPrice = order.quantity ? order.pricing.cylinderPrice / order.quantity : 0;
      doc.text(`Rs. ${unitPrice}`, 300, yPosition, { width: 100, align: 'right' });
      doc.text(`Rs. ${order.pricing.cylinderPrice || 0}`, 400, yPosition, { width: 100, align: 'right' });
      yPosition += 20;

      // Add-ons
      if (order.addOns && order.addOns.length > 0) {
        order.addOns.forEach(addon => {
          doc.text(addon.title || 'Addon', 50, yPosition, { width: 200 });
          doc.text(addon.quantity?.toString() || '0', 250, yPosition, { width: 50 });
          doc.text(`Rs. ${addon.price || 0}`, 300, yPosition, { width: 100, align: 'right' });
          doc.text(`Rs. ${addon.price && addon.quantity ? addon.price * addon.quantity : 0}`, 400, yPosition, { width: 100, align: 'right' });
          yPosition += 20;
        });
      }

      doc.moveTo(50, yPosition).lineTo(500, yPosition).stroke();
      yPosition += 10;

      // Pricing Summary
      doc.text('Subtotal:', 300, yPosition, { width: 100, align: 'right' });
      doc.text(`Rs. ${order.pricing.subtotal || 0}`, 400, yPosition, { width: 100, align: 'right' });
      yPosition += 20;

      if (order.pricing.securityCharges > 0) {
        doc.text('Security Charges:', 300, yPosition, { width: 100, align: 'right' });
        doc.text(`Rs. ${order.pricing.securityCharges}`, 400, yPosition, { width: 100, align: 'right' });
        yPosition += 20;
      }

      doc.text('Delivery Charges:', 300, yPosition, { width: 100, align: 'right' });
      doc.text(`Rs. ${order.pricing.deliveryCharges || 0}`, 400, yPosition, { width: 100, align: 'right' });
      yPosition += 20;

      if (order.pricing.urgentDeliveryFee > 0) {
        doc.text('Urgent Fee:', 300, yPosition, { width: 100, align: 'right' });
        doc.text(`Rs. ${order.pricing.urgentDeliveryFee}`, 400, yPosition, { width: 100, align: 'right' });
        yPosition += 20;
      }

      doc.moveTo(300, yPosition).lineTo(500, yPosition).stroke();
      yPosition += 10;

      doc.fontSize(12).text('Grand Total:', 300, yPosition, { width: 100, align: 'right' });
      doc.text(`Rs. ${order.pricing.grandTotal || 0}`, 400, yPosition, { width: 100, align: 'right' });

      yPosition += 40;
      doc.fontSize(10).text(`Payment Method: ${order.payment?.method?.toUpperCase() || 'N/A'}`);
      doc.text(`Payment Status: ${order.payment?.status?.toUpperCase() || 'N/A'}`);

      doc.moveDown(2);
      doc.fontSize(8).text('Thank you for your business!', { align: 'center' });

      doc.end();
    });
  } catch (error) {
    logger.error('Invoice generation error:', error);
    throw error;
  }
};
