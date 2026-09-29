const { query } = require('../config/db');

const OPEN_STATUSES = ['sent', 'viewed', 'processing', 'overdue'];

/**
 * GET /dashboard  (requires auth + business)
 * One call for the dashboard screen: Stripe connection status (so the UI
 * can show a "finish connecting Stripe" banner) + invoice counts/totals
 * broken out as open vs. paid, + the most recent invoices.
 *
 * Invoices themselves are NOT gated behind Stripe being connected — a
 * merchant can create/manage invoices before onboarding finishes. Only
 * *collecting a card/ACH payment* is gated (enforced in payments.controller.js).
 * `readyForPayments` here is what the app should check before showing
 * "Send for Payment" / card collection UI.
 */
async function getDashboard(req, res) {
  const stripeRows = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [req.business.id]);
  const acct = stripeRows.rows[0] || null;

  const stripeStatus = acct
    ? {
        connected: true,
        onboardingType: acct.onboarding_type,
        chargesEnabled: acct.charges_enabled,
        payoutsEnabled: acct.payouts_enabled,
        detailsSubmitted: acct.details_submitted,
        readyForPayments: acct.charges_enabled && acct.payouts_enabled,
      }
    : { connected: false, readyForPayments: false };

  const { rows: statusCounts } = await query(
    `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total
     FROM invoices WHERE business_id = $1 GROUP BY status`,
    [req.business.id]
  );

  const counts = { draft: 0, sent: 0, viewed: 0, processing: 0, paid: 0, overdue: 0, void: 0 };
  let totalOutstanding = 0;
  let totalPaid = 0;

  for (const row of statusCounts) {
    counts[row.status] = row.count;
    if (OPEN_STATUSES.includes(row.status)) totalOutstanding += Number(row.total);
    if (row.status === 'paid') totalPaid += Number(row.total);
  }

  const { rows: recentInvoices } = await query(
    `SELECT i.id, i.invoice_number, i.status, i.total, i.due_date, i.created_at, c.name AS client_name
     FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.business_id = $1
     ORDER BY i.created_at DESC LIMIT 10`,
    [req.business.id]
  );

  res.json({
    stripeStatus,
    invoiceSummary: {
      counts,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
    },
    recentInvoices,
  });
}

module.exports = { getDashboard };
