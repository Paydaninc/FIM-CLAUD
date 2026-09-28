const { pool, query } = require('../config/db');
const stripe = require('../config/stripe');
const { notifyInvoicePaid } = require('../services/email.service');

const PAYABLE_STATUSES = new Set(['sent', 'overdue']);

async function getInvoiceForBusiness(invoiceId, businessId) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1 AND business_id = $2', [
    invoiceId, businessId,
  ]);
  return rows[0] || null;
}

async function getConnectedAccount(businessId) {
  const { rows } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [businessId]);
  return rows[0] || null;
}

/**
 * POST /invoices/:id/pay/cash
 * No Stripe involvement at all: zero platform fee, zero processing fee.
 * Only allowed once an invoice has actually been sent (not from 'draft') —
 * consistent with the "edit while draft" rule elsewhere.
 */
async function payCash(req, res) {
  const client = await pool.connect();
  try {
    const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (!PAYABLE_STATUSES.has(invoice.status)) {
      return res.status(409).json({ error: `Invoice is '${invoice.status}' and cannot be marked paid.` });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO payments (invoice_id, business_id, method, amount, currency, status)
       VALUES ($1, $2, 'cash', $3, $4, 'succeeded')`,
      [invoice.id, req.business.id, invoice.total, invoice.currency]
    );

    const { rows } = await client.query(
      `UPDATE invoices SET status = 'paid', paid_at = now(), amount_paid = total, last_payment_failure_reason = NULL
       WHERE id = $1 RETURNING *`,
      [invoice.id]
    );

    await client.query('COMMIT');

    // Notifications are best-effort: a failure here must never undo an
    // already-committed cash payment.
    notifyInvoicePaid(invoice.id).catch((err) => console.error('notifyInvoicePaid failed:', err.message));

    res.json({ invoice: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /invoices/:id/pay/card/intent
 * Creates a PaymentIntent as a **direct charge** on the connected (merchant)
 * account: `{stripeAccount: acct_...}` as the request option, with
 * `application_fee_amount` as the platform's cut. The charge — and Stripe's
 * own processing fees — land on the merchant's account, not the platform's.
 *
 * Returns the client_secret + publishable key; the mobile app feeds these
 * straight into Stripe PaymentSheet. Raw card data never reaches this
 * backend — PCI scope stays entirely with Stripe, per your spec.
 *
 * Idempotent: if a pending card PaymentIntent already exists for this
 * invoice, its client_secret is reused rather than creating a duplicate.
 */
async function createCardPaymentIntent(req, res) {
  const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    return res.status(409).json({ error: `Invoice is '${invoice.status}' and cannot be paid.` });
  }

  const stripeAccount = await getConnectedAccount(req.business.id);
  if (!stripeAccount || !stripeAccount.charges_enabled) {
    return res.status(400).json({ error: 'Finish connecting Stripe (charges are not enabled yet) before collecting card payments.' });
  }

  const existing = await query(
    `SELECT * FROM payments
     WHERE invoice_id = $1 AND method = 'card' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [invoice.id]
  );

  const amountCents = Math.round(Number(invoice.total) * 100);
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT || 0.01);
  const applicationFeeCents = Math.round(amountCents * platformFeePercent);

  let paymentIntent;
  if (existing.rows.length > 0) {
    // Reuse the existing PaymentIntent rather than creating a second one
    // for the same invoice (avoids orphaned/duplicate intents on retry).
    paymentIntent = await stripe.paymentIntents.retrieve(
      existing.rows[0].stripe_payment_intent_id,
      undefined,
      { stripeAccount: stripeAccount.stripe_account_id }
    );
  } else {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: invoice.currency,
        application_fee_amount: applicationFeeCents,
        automatic_payment_methods: { enabled: true },
        metadata: { invoice_id: invoice.id, business_id: req.business.id },
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    );

    await query(
      `INSERT INTO payments
         (invoice_id, business_id, method, amount, currency, stripe_payment_intent_id, application_fee_amount, status)
       VALUES ($1, $2, 'card', $3, $4, $5, $6, 'pending')`,
      [invoice.id, req.business.id, invoice.total, invoice.currency, paymentIntent.id, applicationFeeCents / 100]
    );
  }

  res.json({
    clientSecret: paymentIntent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    connectedAccountId: stripeAccount.stripe_account_id,
  });
}

/**
 * POST /invoices/:id/pay/link
 * Creates a Stripe Checkout Session as a **direct charge** on the connected
 * account (same `{stripeAccount}` pattern as the card intent), for the
 * "Copy Link" flow: the app shows the returned URL with a Copy Link button;
 * the merchant pastes it into their own SMS/email app themselves — this
 * backend never sends it on the merchant's behalf, per your spec.
 *
 * Idempotent: reuses an open session for this invoice if one already exists
 * rather than minting a new link every time the screen is opened.
 */
async function createPaymentLink(req, res) {
  const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    return res.status(409).json({ error: `Invoice is '${invoice.status}' and cannot be paid.` });
  }

  const stripeAccount = await getConnectedAccount(req.business.id);
  if (!stripeAccount || !stripeAccount.charges_enabled) {
    return res.status(400).json({ error: 'Finish connecting Stripe (charges are not enabled yet) before generating a payment link.' });
  }

  const existing = await query(
    `SELECT * FROM payments
     WHERE invoice_id = $1 AND method = 'payment_link' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [invoice.id]
  );

  const amountCents = Math.round(Number(invoice.total) * 100);
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT || 0.01);
  const applicationFeeCents = Math.round(amountCents * platformFeePercent);

  if (existing.rows.length > 0) {
    const session = await stripe.checkout.sessions.retrieve(
      existing.rows[0].stripe_checkout_session_id,
      undefined,
      { stripeAccount: stripeAccount.stripe_account_id }
    );
    if (session.status === 'open') {
      return res.json({ checkoutUrl: session.url });
    }
    // Expired or otherwise no longer open — fall through and mint a fresh one below,
    // reusing the same payments row.
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: invoice.currency,
            unit_amount: amountCents,
            product_data: { name: `Invoice #${invoice.invoice_number}` },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        metadata: { invoice_id: invoice.id, business_id: req.business.id },
      },
      metadata: { invoice_id: invoice.id, business_id: req.business.id },
      success_url: `${process.env.APP_BASE_URL}/payment-result?result=success`,
      cancel_url: `${process.env.APP_BASE_URL}/payment-result?result=cancelled`,
    },
    { stripeAccount: stripeAccount.stripe_account_id }
  );

  if (existing.rows.length > 0) {
    await query(
      `UPDATE payments SET stripe_checkout_session_id = $2, stripe_payment_intent_id = $3, status = 'pending'
       WHERE id = $1`,
      [existing.rows[0].id, session.id, session.payment_intent || null]
    );
  } else {
    await query(
      `INSERT INTO payments
         (invoice_id, business_id, method, amount, currency, stripe_checkout_session_id, stripe_payment_intent_id, application_fee_amount, status)
       VALUES ($1, $2, 'payment_link', $3, $4, $5, $6, $7, 'pending')`,
      [invoice.id, req.business.id, invoice.total, invoice.currency, session.id, session.payment_intent || null, applicationFeeCents / 100]
    );
  }

  res.json({ checkoutUrl: session.url });
}

/**
 * POST /invoices/:id/pay/ach/intent
 * ACH via `us_bank_account`, with Financial Connections for instant bank
 * verification (falling back to micro-deposits automatically — that's what
 * `verification_method: 'automatic'` does). Same direct-charge pattern:
 * PaymentIntent created on the connected account with `application_fee_amount`.
 *
 * us_bank_account + Financial Connections in PaymentSheet requires a Stripe
 * Customer (created lazily here, on the connected account, and cached on
 * the client) plus an Ephemeral Key scoped to that customer. The mobile app
 * must pass the exact Stripe API version its SDK is using as `stripe_version`
 * in the request body — the ephemeral key has to match it exactly or the
 * SDK will reject it.
 */
async function createAchPaymentIntent(req, res) {
  const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    return res.status(409).json({ error: `Invoice is '${invoice.status}' and cannot be paid.` });
  }

  const stripeAccount = await getConnectedAccount(req.business.id);
  if (!stripeAccount || !stripeAccount.charges_enabled) {
    return res.status(400).json({ error: 'Finish connecting Stripe (charges are not enabled yet) before collecting ACH payments.' });
  }

  if (!invoice.client_id) {
    return res.status(400).json({ error: 'ACH requires the invoice to have a client with an email address.' });
  }
  const clientRows = await query('SELECT * FROM clients WHERE id = $1 AND business_id = $2', [
    invoice.client_id, req.business.id,
  ]);
  const invoiceClient = clientRows.rows[0];
  if (!invoiceClient || !invoiceClient.email) {
    return res.status(400).json({ error: 'ACH requires the invoice to have a client with an email address.' });
  }

  const stripeVersion = req.body.stripe_version || '2024-06-20';

  // Lazily create (and cache) a Stripe Customer for this client, on the connected account.
  let stripeCustomerId = invoiceClient.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create(
      { email: invoiceClient.email, name: invoiceClient.name },
      { stripeAccount: stripeAccount.stripe_account_id }
    );
    stripeCustomerId = customer.id;
    await query('UPDATE clients SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, invoiceClient.id]);
  }

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: stripeCustomerId },
    { apiVersion: stripeVersion, stripeAccount: stripeAccount.stripe_account_id }
  );

  const existing = await query(
    `SELECT * FROM payments WHERE invoice_id = $1 AND method = 'ach' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [invoice.id]
  );

  const amountCents = Math.round(Number(invoice.total) * 100);
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT || 0.01);
  const applicationFeeCents = Math.round(amountCents * platformFeePercent);

  let paymentIntent;
  if (existing.rows.length > 0) {
    paymentIntent = await stripe.paymentIntents.retrieve(
      existing.rows[0].stripe_payment_intent_id,
      undefined,
      { stripeAccount: stripeAccount.stripe_account_id }
    );
  } else {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: invoice.currency,
        customer: stripeCustomerId,
        payment_method_types: ['us_bank_account'],
        payment_method_options: {
          us_bank_account: {
            verification_method: 'automatic', // tries instant (Financial Connections), falls back to micro-deposits
            financial_connections: { permissions: ['payment_method', 'balances'] },
          },
        },
        application_fee_amount: applicationFeeCents,
        metadata: { invoice_id: invoice.id, business_id: req.business.id },
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    );

    await query(
      `INSERT INTO payments
         (invoice_id, business_id, method, amount, currency, stripe_payment_intent_id, application_fee_amount, status)
       VALUES ($1, $2, 'ach', $3, $4, $5, $6, 'pending')`,
      [invoice.id, req.business.id, invoice.total, invoice.currency, paymentIntent.id, applicationFeeCents / 100]
    );
  }

  res.json({
    clientSecret: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customerId: stripeCustomerId,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    connectedAccountId: stripeAccount.stripe_account_id,
    // Surfaced so the app can't forget to show it:
    disclosure: 'ACH bank payments typically take 4–5 business days to complete. The invoice will show as "Processing" until it settles.',
  });
}

/**
 * POST /invoices/:id/pay/tap-to-pay/intent
 * Card-present PaymentIntent for in-person Tap to Pay collection via the
 * Stripe Terminal SDK. Same direct-charge + application_fee_amount pattern
 * as every other method. The mobile app feeds `clientSecret` into
 * Terminal's collectPaymentMethod/processPayment — no separate success
 * webhook logic needed here, since payment_intent.succeeded/failed already
 * handle any PaymentIntent generically by its stored id.
 */
async function createTapToPayIntent(req, res) {
  const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    return res.status(409).json({ error: `Invoice is '${invoice.status}' and cannot be paid.` });
  }

  const stripeAccount = await getConnectedAccount(req.business.id);
  if (!stripeAccount || !stripeAccount.charges_enabled) {
    return res.status(400).json({ error: 'Finish connecting Stripe (charges are not enabled yet) before using Tap to Pay.' });
  }

  const existing = await query(
    `SELECT * FROM payments WHERE invoice_id = $1 AND method = 'tap_to_pay' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [invoice.id]
  );

  const amountCents = Math.round(Number(invoice.total) * 100);
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT || 0.01);
  const applicationFeeCents = Math.round(amountCents * platformFeePercent);

  let paymentIntent;
  if (existing.rows.length > 0) {
    paymentIntent = await stripe.paymentIntents.retrieve(
      existing.rows[0].stripe_payment_intent_id,
      undefined,
      { stripeAccount: stripeAccount.stripe_account_id }
    );
  } else {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: invoice.currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        application_fee_amount: applicationFeeCents,
        metadata: { invoice_id: invoice.id, business_id: req.business.id },
      },
      { stripeAccount: stripeAccount.stripe_account_id }
    );

    await query(
      `INSERT INTO payments
         (invoice_id, business_id, method, amount, currency, stripe_payment_intent_id, application_fee_amount, status)
       VALUES ($1, $2, 'tap_to_pay', $3, $4, $5, $6, 'pending')`,
      [invoice.id, req.business.id, invoice.total, invoice.currency, paymentIntent.id, applicationFeeCents / 100]
    );
  }

  res.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: stripeAccount.stripe_account_id,
  });
}

/**
 * POST /invoices/:id/refund
 * Basic refund flow, as your spec asked for at minimum. Body: { amount? }
 * in dollars — omit for a full refund. `refund_application_fee: true` so
 * the platform's cut is reversed too when the merchant refunds a customer;
 * the platform doesn't keep money for a sale that got undone.
 *
 * This does NOT update the invoice/payment rows directly — it kicks off
 * the refund with Stripe and lets the existing `charge.refunded` webhook
 * handler (see webhooks/stripe.webhook.js) do that, exactly like an
 * automatic ACH-return refund does. One code path for "a charge got
 * refunded," not two that could drift apart.
 */
async function refundInvoice(req, res) {
  const invoice = await getInvoiceForBusiness(req.params.id, req.business.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (invoice.status !== 'paid') {
    return res.status(409).json({ error: 'Only a paid invoice can be refunded.' });
  }

  const { rows } = await query(
    `SELECT * FROM payments WHERE invoice_id = $1 AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1`,
    [invoice.id]
  );
  const payment = rows[0];
  if (!payment) return res.status(409).json({ error: 'No successful payment found for this invoice.' });

  if (payment.method === 'cash') {
    return res.status(400).json({
      error: 'Cash payments were never charged through Stripe, so there is nothing to refund here. Update your own records manually.',
    });
  }
  if (!payment.stripe_payment_intent_id) {
    return res.status(409).json({ error: 'No Stripe payment on file for this invoice.' });
  }

  const stripeAccount = await getConnectedAccount(req.business.id);

  const refundParams = {
    payment_intent: payment.stripe_payment_intent_id,
    refund_application_fee: true,
  };
  if (req.body.amount) {
    refundParams.amount = Math.round(Number(req.body.amount) * 100);
  }

  const refund = await stripe.refunds.create(refundParams, { stripeAccount: stripeAccount.stripe_account_id });

  res.json({
    refund: { id: refund.id, status: refund.status, amount: refund.amount / 100 },
    note: "The invoice will update to reflect the refund automatically once Stripe confirms it (this can take a moment — it's webhook-driven, not immediate).",
  });
}

module.exports = {
  payCash, createCardPaymentIntent, createPaymentLink, createAchPaymentIntent, createTapToPayIntent, refundInvoice,
};
