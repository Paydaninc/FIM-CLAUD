const sgMail = require('../config/sendgrid');
const { query } = require('../config/db');
const { bufferInvoicePdf } = require('./pdf.service');

function emailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
}

/**
 * Sends via SendGrid when configured. If it isn't (no API key yet — common
 * in early local dev), logs what *would* have been sent and returns
 * { sent: false } rather than silently no-oping as if it succeeded — so
 * nothing downstream can mistake "not configured" for "delivered".
 * `attachmentBuffer`/`attachmentFilename` are optional (used for the PDF receipt).
 */
async function sendEmail({ to, subject, text, html, attachmentBuffer, attachmentFilename }) {
  if (!to) return { sent: false, reason: 'No recipient email address.' };

  if (!emailConfigured()) {
    console.log(`[email not sent — SendGrid not configured] To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing).' };
  }

  const msg = { to, from: process.env.SENDGRID_FROM_EMAIL, subject, text, html };
  if (attachmentBuffer) {
    msg.attachments = [{
      content: attachmentBuffer.toString('base64'),
      filename: attachmentFilename || 'invoice.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    }];
  }

  try {
    await sgMail.send(msg);
    return { sent: true };
  } catch (err) {
    // Email failures should never break the calling operation (signup, a
    // payment webhook) — log and report, don't throw.
    console.error(`Failed to send email to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendVerificationEmail(user, verificationLink) {
  return sendEmail({
    to: user.email,
    subject: 'Verify your email — Free Invoice Maker',
    text: `Welcome! Verify your email by visiting: ${verificationLink}`,
    html: `<p>Welcome to Free Invoice Maker.</p><p><a href="${verificationLink}">Verify your email</a></p>`,
  });
}

function formatMoney(amount, currency) {
  return `${Number(amount).toFixed(2)} ${String(currency || 'usd').toUpperCase()}`;
}

/**
 * Fires when an invoice transitions to 'paid', regardless of which payment
 * method drove it (cash, card, payment link, ACH, Tap to Pay). Sends a
 * receipt to the client (if we have their email) and a "you got paid"
 * notification to the merchant. Called from payments.controller.js and the
 * Stripe webhook — both places wrap this in try/catch, since a notification
 * failure must never undo or block a successful payment.
 */
/**
 * Fires when an invoice transitions to 'paid', regardless of which payment
 * method drove it (cash, card, payment link, ACH, Tap to Pay). Sends a
 * receipt (with the invoice PDF attached) to the client, and a "you got
 * paid" notification to the merchant. Called from payments.controller.js
 * and the Stripe webhook — both wrap this in try/catch, since a
 * notification failure must never undo or block a successful payment.
 */
async function notifyInvoicePaid(invoiceId) {
  const { rows: invoiceRows } = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  const invoice = invoiceRows[0];
  if (!invoice) return;

  const { rows: businessRows } = await query('SELECT * FROM businesses WHERE id = $1', [invoice.business_id]);
  const business = businessRows[0];

  let client = null;
  if (invoice.client_id) {
    const { rows: clientRows } = await query('SELECT * FROM clients WHERE id = $1', [invoice.client_id]);
    client = clientRows[0] || null;
  }

  const { rows: lineItems } = await query(
    'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC',
    [invoiceId]
  );

  const amount = formatMoney(invoice.total, invoice.currency);

  // PDF attachment is best-effort too — a broken logo URL or similar
  // shouldn't block the receipt email from going out at all.
  let pdfBuffer = null;
  try {
    pdfBuffer = await bufferInvoicePdf({ invoice: { ...invoice, line_items: lineItems }, business, client });
  } catch (err) {
    console.error('Could not generate PDF for payment receipt email:', err.message);
  }

  const clientReceipt = await sendEmail({
    to: client?.email,
    subject: `Receipt — Invoice #${invoice.invoice_number} from ${business.business_name}`,
    text: `Your payment of ${amount} for invoice #${invoice.invoice_number} from ${business.business_name} has been received. Thank you!`,
    html: `<p>Your payment of <strong>${amount}</strong> for invoice #${invoice.invoice_number} from ${business.business_name} has been received.</p><p>Thank you!</p>`,
    attachmentBuffer: pdfBuffer,
    attachmentFilename: `invoice-${invoice.invoice_number}.pdf`,
  });

  const merchantNotification = await sendEmail({
    to: business?.email,
    subject: `You got paid — Invoice #${invoice.invoice_number}`,
    text: `Invoice #${invoice.invoice_number}${client ? ` for ${client.name}` : ''} was just paid: ${amount}.`,
    html: `<p>Invoice #${invoice.invoice_number}${client ? ` for ${client.name}` : ''} was just paid: <strong>${amount}</strong>.</p>`,
  });

  return { clientReceipt, merchantNotification };
}

module.exports = { sendEmail, sendVerificationEmail, notifyInvoicePaid, emailConfigured };
