const PDFDocument = require('pdfkit');

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed', processing: 'Processing',
  paid: 'Paid', overdue: 'Overdue', void: 'Void',
};

function money(amount, currency) {
  return `${Number(amount).toFixed(2)} ${String(currency || 'usd').toUpperCase()}`;
}

/**
 * Fetches the business logo as a Buffer, if logo_url is set and reachable.
 * Never throws — a broken/unreachable logo URL just means no logo on the
 * PDF, not a failed invoice download.
 */
async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('Could not fetch business logo for PDF:', err.message);
    return null;
  }
}

/**
 * Draws the actual invoice content onto an already-created PDFDocument.
 * Shared by both the HTTP download endpoint (pipes straight to the
 * response) and the emailed receipt (collected into a Buffer) so the
 * layout only lives in one place.
 */
async function drawInvoice(doc, { invoice, business, client }) {
  const logoBuffer = await fetchLogoBuffer(business.logo_url);

  // ── Header: business info (+ logo, if we got one) ──────────────────
  const headerTop = doc.y;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 400, headerTop, { fit: [150, 60] });
    } catch (err) {
      console.error('Could not embed business logo (unsupported format?):', err.message);
    }
  }

  doc.fontSize(18).font('Helvetica-Bold').text(business.business_name || 'Your Business', 50, headerTop);
  doc.fontSize(10).font('Helvetica').fillColor('#555');
  const addressLines = [
    business.address_line1, business.address_line2,
    [business.city, business.state, business.postal_code].filter(Boolean).join(', '),
    business.phone, business.email,
  ].filter(Boolean);
  addressLines.forEach((line) => doc.text(line));
  doc.fillColor('#000');
  doc.moveDown(1.5);

  // ── Invoice title / number / status ─────────────────────────────────
  doc.fontSize(20).font('Helvetica-Bold').text(`Invoice #${invoice.invoice_number}`);
  doc.fontSize(11).font('Helvetica').text(`Status: ${STATUS_LABELS[invoice.status] || invoice.status}`);
  if (invoice.due_date) {
    doc.text(`Due date: ${new Date(invoice.due_date).toLocaleDateString()}`);
  }
  doc.moveDown(1);

  // ── Bill to ──────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').text('Bill to');
  doc.font('Helvetica');
  if (client) {
    doc.text(client.name);
    if (client.email) doc.text(client.email);
    const clientAddress = [
      client.address_line1, client.address_line2,
      [client.city, client.state, client.postal_code].filter(Boolean).join(', '),
    ].filter(Boolean);
    clientAddress.forEach((line) => doc.text(line));
  } else {
    doc.fillColor('#999').text('No client on file').fillColor('#000');
  }
  doc.moveDown(1.5);

  // ── Line items table ─────────────────────────────────────────────────
  const tableTop = doc.y;
  const colX = { desc: 50, qty: 320, price: 380, total: 460 };
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Description', colX.desc, tableTop);
  doc.text('Qty', colX.qty, tableTop);
  doc.text('Unit price', colX.price, tableTop);
  doc.text('Amount', colX.total, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#ccc').stroke();

  doc.font('Helvetica').fontSize(10);
  let rowY = tableTop + 22;
  for (const item of invoice.line_items) {
    const lineTotal = Number(item.quantity) * Number(item.unit_price);
    doc.text(item.description, colX.desc, rowY, { width: 260 });
    doc.text(String(item.quantity), colX.qty, rowY);
    doc.text(money(item.unit_price, invoice.currency), colX.price, rowY);
    doc.text(money(lineTotal, invoice.currency), colX.total, rowY);
    rowY += 20;
  }
  doc.moveTo(50, rowY).lineTo(545, rowY).strokeColor('#ccc').stroke();
  rowY += 12;

  // ── Totals ───────────────────────────────────────────────────────────
  const totalsX = 380;
  const totalRow = (label, value, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    doc.text(label, totalsX, rowY, { width: 90 });
    doc.text(value, totalsX + 90, rowY, { width: 75, align: 'right' });
    rowY += bold ? 18 : 15;
  };
  totalRow('Subtotal', money(invoice.subtotal, invoice.currency));
  if (Number(invoice.discount_total) > 0) totalRow('Discount', `-${money(invoice.discount_total, invoice.currency)}`);
  if (Number(invoice.tax_total) > 0) totalRow('Tax', money(invoice.tax_total, invoice.currency));
  totalRow('Total', money(invoice.total, invoice.currency), true);
  if (invoice.status === 'paid') {
    totalRow('Amount paid', money(invoice.amount_paid, invoice.currency));
  }

  // ── Notes / terms ────────────────────────────────────────────────────
  doc.moveDown(3);
  if (invoice.payment_terms) {
    doc.font('Helvetica-Bold').fontSize(10).text('Payment terms');
    doc.font('Helvetica').text(invoice.payment_terms);
    doc.moveDown(0.5);
  }
  if (invoice.notes) {
    doc.font('Helvetica-Bold').fontSize(10).text('Notes');
    doc.font('Helvetica').text(invoice.notes);
  }

  doc.end();
}

/**
 * Streams the PDF directly to an Express response (headers already set by
 * the caller) — no temp file on disk.
 */
async function streamInvoicePdf(res, data) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  doc.pipe(res);
  await drawInvoice(doc, data);
}

/**
 * Same drawing logic, collected into a Buffer instead — used to attach the
 * PDF to the emailed payment receipt.
 */
function bufferInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawInvoice(doc, data).catch(reject);
  });
}

module.exports = { streamInvoicePdf, bufferInvoicePdf };
