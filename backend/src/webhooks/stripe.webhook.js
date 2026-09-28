const express = require('express');
const stripe = require('../config/stripe');
const { query } = require('../config/db');
const { updateStripeAccountByStripeId } = require('../services/stripeAccount.service');
const { notifyInvoicePaid } = require('../services/email.service');
const router = express.Router();

/**
 * POST /webhooks/stripe
 * Mounted with express.raw() (see app.js) — Stripe's signature verification
 * requires the exact raw request body, not the parsed JSON.
 *
 * Idempotency: every event's id is recorded in webhook_events before
 * processing. If Stripe redelivers the same event (which it does — this is
 * expected, not a bug), we detect the duplicate and skip re-processing.
 */
router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Record-or-detect-duplicate atomically via the unique constraint on stripe_event_id.
  try {
    await query('INSERT INTO webhook_events (stripe_event_id, type) VALUES ($1, $2)', [event.id, event.type]);
  } catch (err) {
    if (err.code === '23505') {
      // Already processed this exact event before — ack and stop, don't reprocess.
      return res.json({ received: true, duplicate: true });
    }
    throw err;
  }

  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object;
      await updateStripeAccountByStripeId(account);
      break;
    }

    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const { rows } = await query(
        `UPDATE payments SET status = 'succeeded' WHERE stripe_payment_intent_id = $1 RETURNING invoice_id`,
        [intent.id]
      );
      if (rows.length > 0) {
        await query(
          `UPDATE invoices SET status = 'paid', paid_at = now(), amount_paid = total, last_payment_failure_reason = NULL
           WHERE id = $1`,
          [rows[0].invoice_id]
        );
        notifyInvoicePaid(rows[0].invoice_id).catch((err) => console.error('notifyInvoicePaid failed:', err.message));
      }
      // If no matching payment row: this PaymentIntent wasn't one we created via
      // createCardPaymentIntent (e.g. a stray test in the Dashboard) — nothing to update.
      break;
    }

    case 'payment_intent.processing': {
      // ACH lands here between submission and settlement (a few business days).
      const intent = event.data.object;
      const { rows } = await query(
        `SELECT invoice_id FROM payments WHERE stripe_payment_intent_id = $1`,
        [intent.id]
      );
      if (rows.length > 0) {
        await query(
          `UPDATE invoices SET status = 'processing' WHERE id = $1 AND status NOT IN ('paid', 'void')`,
          [rows[0].invoice_id]
        );
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const failureReason = intent.last_payment_error?.message || 'Payment failed.';
      const { rows } = await query(
        `UPDATE payments SET status = 'failed', failure_reason = $2
         WHERE stripe_payment_intent_id = $1 RETURNING invoice_id`,
        [intent.id, failureReason]
      );
      if (rows.length > 0) {
        // Revert to 'overdue' if past due_date, else back to 'sent' — either way,
        // the failure reason surfaces on the invoice per your edge-case spec.
        await query(
          `UPDATE invoices
           SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END,
               last_payment_failure_reason = $2
           WHERE id = $1`,
          [rows[0].invoice_id, failureReason]
        );
      }
      break;
    }

    case 'charge.refunded': {
      // This closes the gap flagged earlier: a bank return arriving *after* an ACH
      // PaymentIntent already succeeded doesn't re-fire payment_intent.payment_failed —
      // Stripe instead auto-refunds the charge and sends this event instead. It also
      // covers a manual refund once that flow exists (Phase 5), so this one handler
      // serves both cases rather than needing a second later.
      const charge = event.data.object;
      if (!charge.payment_intent) break;

      const isFullRefund = charge.refunded || charge.amount_refunded >= charge.amount;
      const refundedAmount = charge.amount_refunded / 100;

      const { rows } = await query(
        `UPDATE payments
         SET status = $2, refunded_amount = $3
         WHERE stripe_payment_intent_id = $1
         RETURNING invoice_id`,
        [charge.payment_intent, isFullRefund ? 'refunded' : 'partially_refunded', refundedAmount]
      );

      if (rows.length > 0 && isFullRefund) {
        // Fully reversed: the invoice is no longer paid. Revert exactly like a failed
        // payment (sent, or overdue if past due_date), with a visible reason.
        await query(
          `UPDATE invoices
           SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END,
               amount_paid = 0,
               paid_at = NULL,
               last_payment_failure_reason = 'Payment was refunded (e.g. a bank returned the ACH debit after it initially succeeded).'
           WHERE id = $1`,
          [rows[0].invoice_id]
        );
      }
      // Partial refunds don't change invoice status yet — surfacing partial-refund
      // amounts on the invoice detail screen is part of the full refunds-phase UI.
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object;
      // A completed Checkout Session for an async payment method (e.g. ACH) can still
      // be unpaid at this point — only mark paid once payment_status says so. If it's
      // still processing, payment_intent.* (or a future ACH-specific event) finishes the job.
      if (session.payment_status !== 'paid') break;

      const { rows } = await query(
        `UPDATE payments SET status = 'succeeded', stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $2)
         WHERE stripe_checkout_session_id = $1 RETURNING invoice_id`,
        [session.id, session.payment_intent || null]
      );
      if (rows.length > 0) {
        await query(
          `UPDATE invoices SET status = 'paid', paid_at = now(), amount_paid = total, last_payment_failure_reason = NULL
           WHERE id = $1`,
          [rows[0].invoice_id]
        );
        notifyInvoicePaid(rows[0].invoice_id).catch((err) => console.error('notifyInvoicePaid failed:', err.message));
      }
      break;
    }

    case 'charge.dispute.created': {
      // Basic visibility only, per your spec ("at least a basic refund flow") —
      // this doesn't try to manage the dispute lifecycle, just surfaces that
      // one exists so the merchant isn't blindsided.
      const dispute = event.data.object;
      const { rows } = await query(
        `SELECT invoice_id FROM payments WHERE stripe_payment_intent_id = $1`,
        [dispute.payment_intent]
      );
      if (rows.length > 0) {
        await query(
          `UPDATE invoices SET disputed = TRUE, dispute_reason = $2 WHERE id = $1`,
          [rows[0].invoice_id, dispute.reason || 'Dispute opened by cardholder.']
        );
      }
      break;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const { rows } = await query(
        `SELECT invoice_id FROM payments WHERE stripe_payment_intent_id = $1`,
        [dispute.payment_intent]
      );
      if (rows.length > 0) {
        if (dispute.status === 'won') {
          // Merchant kept the funds — clear the flag, invoice stays paid.
          await query(`UPDATE invoices SET disputed = FALSE, dispute_reason = NULL WHERE id = $1`, [rows[0].invoice_id]);
        } else {
          // Lost (or otherwise closed against the merchant): funds are gone, same
          // end state as a refund. charge.refunded normally fires alongside this
          // for the actual reversal — this just makes sure the dispute flag itself
          // clears rather than sticking around after the money's already handled.
          await query(
            `UPDATE invoices SET disputed = FALSE, dispute_reason = $2 WHERE id = $1`,
            [rows[0].invoice_id, `Dispute lost: ${dispute.status}.`]
          );
        }
      }
      break;
    }

    default:
      // Unhandled event types are expected and fine — we only subscribe to what we need
      // in the Stripe Dashboard/CLI, but Stripe may send others depending on account config.
      break;
  }

  res.json({ received: true });
});

module.exports = router;
