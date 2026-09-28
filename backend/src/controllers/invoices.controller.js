const { pool } = require('../config/db');
const { computeInvoiceTotals } = require('../services/invoiceCalc.service');
const { streamInvoicePdf } = require('../services/pdf.service');

const EDITABLE_STATUSES = new Set(['draft']); // see README "Invoice edit rules"
const DELETABLE_STATUSES = new Set(['draft', 'void']);

async function fetchInvoiceWithLineItems(client, invoiceId, businessId) {
  const invoiceResult = await client.query(
    `SELECT i.*, c.name AS client_name, c.email AS client_email
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.id = $1 AND i.business_id = $2`,
    [invoiceId, businessId]
  );
  if (invoiceResult.rows.length === 0) return null;

  const lineItemsResult = await client.query(
    'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order ASC',
    [invoiceId]
  );

  return { ...invoiceResult.rows[0], line_items: lineItemsResult.rows };
}

/**
 * Shared by create + duplicate: allocates the next invoice number for a
 * business atomically (row-locked) so two concurrent creates never collide.
 */
async function allocateInvoiceNumber(client, businessId) {
  const { rows } = await client.query(
    'SELECT next_invoice_number FROM businesses WHERE id = $1 FOR UPDATE',
    [businessId]
  );
  const invoiceNumber = rows[0].next_invoice_number;
  await client.query('UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = $1', [
    businessId,
  ]);
  return invoiceNumber;
}

async function insertLineItems(client, invoiceId, lineItems) {
  let i = 0;
  for (const item of lineItems) {
    await client.query(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, tax_rate, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invoiceId, item.description, item.quantity, item.unit_price, item.tax_rate ?? null, i]
    );
    i += 1;
  }
}

/**
 * POST /invoices
 * body: { client_id?, due_date?, notes?, payment_terms?, tax_rate?,
 *         discount_type?, discount_value?, line_items: [{description, quantity, unit_price, tax_rate?}] }
 */
async function createInvoice(req, res) {
  const {
    client_id, due_date, notes, payment_terms, tax_rate,
    discount_type, discount_value, line_items,
  } = req.body;

  if (!Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: 'At least one line item is required.' });
  }

  const totals = computeInvoiceTotals({
    lineItems: line_items,
    invoiceTaxRate: tax_rate,
    businessDefaultTaxRate: req.business.default_tax_rate,
    discountType: discount_type,
    discountValue: discount_value,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceNumber = await allocateInvoiceNumber(client, req.business.id);

    const { rows } = await client.query(
      `INSERT INTO invoices
         (business_id, client_id, invoice_number, status, subtotal, tax_total, discount_total, total,
          tax_rate, discount_type, discount_value, due_date, notes, payment_terms)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.business.id, client_id ?? null, invoiceNumber,
        totals.subtotal, totals.tax_total, totals.discount_total, totals.total,
        tax_rate ?? null, discount_type ?? null, discount_value ?? 0,
        due_date ?? null, notes ?? null, payment_terms ?? req.business.default_payment_terms,
      ]
    );
    const invoice = rows[0];

    await insertLineItems(client, invoice.id, line_items);
    await client.query('COMMIT');

    const full = await fetchInvoiceWithLineItems(client, invoice.id, req.business.id);
    res.status(201).json({ invoice: full });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * GET /invoices?status=&clientId=&fromDate=&toDate=&search=
 */
async function listInvoices(req, res) {
  const { status, clientId, fromDate, toDate, search } = req.query;

  const conditions = ['i.business_id = $1'];
  const params = [req.business.id];

  if (status) {
    params.push(status);
    conditions.push(`i.status = $${params.length}`);
  }
  if (clientId) {
    params.push(clientId);
    conditions.push(`i.client_id = $${params.length}`);
  }
  if (fromDate) {
    params.push(fromDate);
    conditions.push(`i.created_at >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(`i.created_at <= $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.name ILIKE $${params.length} OR CAST(i.invoice_number AS TEXT) ILIKE $${params.length})`);
  }

  const { rows } = await pool.query(
    `SELECT i.*, c.name AS client_name
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY i.created_at DESC`,
    params
  );

  res.json({ invoices: rows });
}

/**
 * GET /invoices/:id
 */
async function getInvoice(req, res) {
  const invoice = await fetchInvoiceWithLineItems(pool, req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice });
}

/**
 * PATCH /invoices/:id
 * Replaces line items wholesale and recomputes totals. Only allowed while
 * status is 'draft' — see README "Invoice edit rules" for why (once sent,
 * changing amounts under a customer who may already be viewing/paying it
 * would be confusing and, worse, could desync from a payment already in
 * flight). Use void + duplicate to correct a sent invoice instead.
 */
async function updateInvoice(req, res) {
  const client = await pool.connect();
  try {
    const current = await fetchInvoiceWithLineItems(client, req.params.id, req.business.id);
    if (!current) return res.status(404).json({ error: 'Invoice not found.' });
    if (!EDITABLE_STATUSES.has(current.status)) {
      return res.status(409).json({
        error: `Invoice is '${current.status}' and can no longer be edited. Void it and create a new one instead.`,
      });
    }

    const {
      client_id, due_date, notes, payment_terms, tax_rate,
      discount_type, discount_value, line_items,
    } = req.body;

    const finalLineItems = line_items ?? current.line_items;
    if (!Array.isArray(finalLineItems) || finalLineItems.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required.' });
    }

    const totals = computeInvoiceTotals({
      lineItems: finalLineItems,
      invoiceTaxRate: tax_rate !== undefined ? tax_rate : current.tax_rate,
      businessDefaultTaxRate: req.business.default_tax_rate,
      discountType: discount_type !== undefined ? discount_type : current.discount_type,
      discountValue: discount_value !== undefined ? discount_value : current.discount_value,
    });

    await client.query('BEGIN');

    await client.query(
      `UPDATE invoices SET
         client_id = $1, due_date = $2, notes = $3, payment_terms = $4, tax_rate = $5,
         discount_type = $6, discount_value = $7,
         subtotal = $8, tax_total = $9, discount_total = $10, total = $11
       WHERE id = $12`,
      [
        client_id !== undefined ? client_id : current.client_id,
        due_date !== undefined ? due_date : current.due_date,
        notes !== undefined ? notes : current.notes,
        payment_terms !== undefined ? payment_terms : current.payment_terms,
        tax_rate !== undefined ? tax_rate : current.tax_rate,
        discount_type !== undefined ? discount_type : current.discount_type,
        discount_value !== undefined ? discount_value : current.discount_value,
        totals.subtotal, totals.tax_total, totals.discount_total, totals.total,
        current.id,
      ]
    );

    if (line_items) {
      await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [current.id]);
      await insertLineItems(client, current.id, finalLineItems);
    }

    await client.query('COMMIT');
    const full = await fetchInvoiceWithLineItems(client, current.id, req.business.id);
    res.json({ invoice: full });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /invoices/:id/duplicate
 * Always creates a fresh 'draft', regardless of the source invoice's status.
 */
async function duplicateInvoice(req, res) {
  const client = await pool.connect();
  try {
    const source = await fetchInvoiceWithLineItems(client, req.params.id, req.business.id);
    if (!source) return res.status(404).json({ error: 'Invoice not found.' });

    await client.query('BEGIN');
    const invoiceNumber = await allocateInvoiceNumber(client, req.business.id);

    const { rows } = await client.query(
      `INSERT INTO invoices
         (business_id, client_id, invoice_number, status, subtotal, tax_total, discount_total, total,
          tax_rate, discount_type, discount_value, due_date, notes, payment_terms)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.business.id, source.client_id, invoiceNumber,
        source.subtotal, source.tax_total, source.discount_total, source.total,
        source.tax_rate, source.discount_type, source.discount_value,
        null, source.notes, source.payment_terms, // due_date intentionally cleared on duplicate
      ]
    );
    const newInvoice = rows[0];
    await insertLineItems(client, newInvoice.id, source.line_items);

    await client.query('COMMIT');
    const full = await fetchInvoiceWithLineItems(client, newInvoice.id, req.business.id);
    res.status(201).json({ invoice: full });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * DELETE /invoices/:id
 * Only draft or void invoices can be hard-deleted — anything that was ever
 * sent for payment keeps its history (use void instead).
 */
async function deleteInvoice(req, res) {
  const { rows } = await pool.query('SELECT status FROM invoices WHERE id = $1 AND business_id = $2', [
    req.params.id, req.business.id,
  ]);
  if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found.' });
  if (!DELETABLE_STATUSES.has(rows[0].status)) {
    return res.status(409).json({ error: `Invoice is '${rows[0].status}' and cannot be deleted. Void it instead.` });
  }

  await pool.query('DELETE FROM invoices WHERE id = $1 AND business_id = $2', [req.params.id, req.business.id]);
  res.status(204).send();
}

/**
 * POST /invoices/:id/send
 * Draft → Sent. Doesn't send anything itself (per your spec, the user
 * copies the payment link / shares the PDF manually) — just records that
 * this invoice is now considered issued.
 */
async function sendInvoice(req, res) {
  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'sent', sent_at = now()
     WHERE id = $1 AND business_id = $2 AND status = 'draft'
     RETURNING *`,
    [req.params.id, req.business.id]
  );
  if (rows.length === 0) {
    return res.status(409).json({ error: 'Only a draft invoice can be marked as sent.' });
  }
  res.json({ invoice: rows[0] });
}

/**
 * POST /invoices/:id/void
 * Allowed from any status except 'paid' (a paid invoice should be refunded,
 * not voided — refunds arrive in the payment-collection phase).
 */
async function voidInvoice(req, res) {
  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'void', voided_at = now()
     WHERE id = $1 AND business_id = $2 AND status != 'paid'
     RETURNING *`,
    [req.params.id, req.business.id]
  );
  if (rows.length === 0) {
    return res.status(409).json({ error: "Invoice not found, already void, or is 'paid' (refund it instead)." });
  }
  res.json({ invoice: rows[0] });
}

/**
 * GET /invoices/:id/pdf
 * Streams a generated invoice PDF directly — no temp files, no separate
 * storage step. Works regardless of invoice status (a draft can be
 * previewed, a paid one downloaded as a receipt-style record).
 */
async function getInvoicePdf(req, res) {
  const invoice = await fetchInvoiceWithLineItems(pool, req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  let client = null;
  if (invoice.client_id) {
    const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [invoice.client_id]);
    client = rows[0] || null;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="invoice-${invoice.invoice_number}.pdf"`);
  await streamInvoicePdf(res, { invoice, business: req.business, client });
}

module.exports = {
  createInvoice, listInvoices, getInvoice, updateInvoice,
  duplicateInvoice, deleteInvoice, sendInvoice, voidInvoice, getInvoicePdf,
};
