const { query } = require('../config/db');

const BUSINESS_FIELDS = [
  'business_name',
  'logo_url',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'phone',
  'email',
  'default_tax_rate',
  'default_payment_terms',
];

/**
 * POST /admin/bootstrap  (requires auth, NOT requireAdmin — that's the point)
 * One-time setup: the first user to call this becomes the first admin.
 * Refuses once any admin already exists, so it can't be used to add more
 * admins later — do that directly in the database if it's ever needed.
 */
async function bootstrapAdmin(req, res) {
  const existing = await query('SELECT id FROM users WHERE is_admin = true LIMIT 1');
  if (existing.rows.length > 0) {
    return res.status(403).json({ error: 'An admin account already exists.' });
  }
  const { rows } = await query(
    'UPDATE users SET is_admin = true WHERE id = $1 RETURNING id, email, is_admin',
    [req.userId]
  );
  res.json({ user: rows[0] });
}

/**
 * GET /admin/accounts?search=  (requires auth + requireAdmin)
 * One row per signed-up user, with their business (if any) and a rollup of
 * their invoices, for a support-oriented list view.
 */
async function listAccounts(req, res) {
  const search = (req.query.search || '').trim();
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE u.email ILIKE $1 OR b.business_name ILIKE $1`;
  }

  const { rows } = await query(
    `SELECT
       u.id, u.email, u.is_active, u.is_admin, u.email_verified, u.created_at,
       b.id AS business_id, b.business_name, b.onboarding_complete,
       sa.charges_enabled, sa.payouts_enabled,
       COUNT(i.id)::int AS invoice_count,
       COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid'), 0) AS total_paid
     FROM users u
     LEFT JOIN businesses b ON b.user_id = u.id
     LEFT JOIN stripe_accounts sa ON sa.business_id = b.id
     LEFT JOIN invoices i ON i.business_id = b.id
     ${where}
     GROUP BY u.id, b.id, sa.id
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );
  res.json({ accounts: rows });
}

/**
 * GET /admin/accounts/:userId  (requires auth + requireAdmin)
 * Full detail for one account: user, business, Stripe status, client count.
 */
async function getAccount(req, res) {
  const { userId } = req.params;

  const { rows: userRows } = await query(
    'SELECT id, email, is_active, is_admin, email_verified, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRows.length === 0) return res.status(404).json({ error: 'Account not found.' });

  const { rows: businessRows } = await query('SELECT * FROM businesses WHERE user_id = $1', [userId]);
  const business = businessRows[0] || null;

  let stripeAccount = null;
  let clientCount = 0;
  if (business) {
    const { rows: sa } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [business.id]);
    stripeAccount = sa[0] || null;
    const { rows: cc } = await query('SELECT COUNT(*)::int AS n FROM clients WHERE business_id = $1', [business.id]);
    clientCount = cc[0].n;
  }

  res.json({ user: userRows[0], business, stripeAccount, clientCount });
}

/**
 * PATCH /admin/accounts/:userId/business  (requires auth + requireAdmin)
 * Lets support edit a customer's business info directly — e.g. fixing a typo
 * in their address or tax rate without needing the customer to do it themselves.
 */
async function updateAccountBusiness(req, res) {
  const { userId } = req.params;
  const fieldsToUpdate = BUSINESS_FIELDS.filter((field) => field in req.body);

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided.' });
  }

  const setClause = fieldsToUpdate.map((field, i) => `${field} = $${i + 2}`).join(', ');
  const values = fieldsToUpdate.map((field) => req.body[field]);

  const { rows } = await query(
    `UPDATE businesses SET ${setClause} WHERE user_id = $1 RETURNING *`,
    [userId, ...values]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'This account has no business profile yet.' });
  }
  res.json({ business: rows[0] });
}

/**
 * POST /admin/accounts/:userId/deactivate  (requires auth + requireAdmin)
 * Blocks login immediately, and — since requireAuth checks is_active on every
 * request — signs the user out of any session already in progress too.
 */
async function deactivateAccount(req, res) {
  const { userId } = req.params;
  if (userId === req.userId) {
    return res.status(400).json({ error: "You can't deactivate your own admin account." });
  }
  const { rows } = await query(
    'UPDATE users SET is_active = false WHERE id = $1 RETURNING id, email, is_active',
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: rows[0] });
}

/**
 * POST /admin/accounts/:userId/reactivate  (requires auth + requireAdmin)
 */
async function reactivateAccount(req, res) {
  const { userId } = req.params;
  const { rows } = await query(
    'UPDATE users SET is_active = true WHERE id = $1 RETURNING id, email, is_active',
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: rows[0] });
}

/**
 * GET /admin/accounts/:userId/transactions  (requires auth + requireAdmin)
 * Every invoice for this account plus its payment history — the transaction
 * log a support conversation usually needs (what was charged, when, how, and
 * whether it succeeded or was refunded).
 */
async function getAccountTransactions(req, res) {
  const { userId } = req.params;
  const { rows: businessRows } = await query('SELECT id FROM businesses WHERE user_id = $1', [userId]);
  if (businessRows.length === 0) return res.json({ invoices: [] });
  const businessId = businessRows[0].id;

  const { rows: invoices } = await query(
    `SELECT i.id, i.invoice_number, i.status, i.total, i.amount_paid, i.currency,
            i.created_at, i.paid_at, c.name AS client_name
     FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.business_id = $1
     ORDER BY i.created_at DESC
     LIMIT 500`,
    [businessId]
  );

  const { rows: payments } = await query(
    `SELECT id, invoice_id, method, amount, currency, status, failure_reason,
            refunded_amount, stripe_payment_intent_id, created_at
     FROM payments
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [businessId]
  );

  const paymentsByInvoice = {};
  for (const p of payments) {
    (paymentsByInvoice[p.invoice_id] = paymentsByInvoice[p.invoice_id] || []).push(p);
  }
  const result = invoices.map((inv) => ({ ...inv, payments: paymentsByInvoice[inv.id] || [] }));

  res.json({ invoices: result });
}

module.exports = {
  bootstrapAdmin,
  listAccounts,
  getAccount,
  updateAccountBusiness,
  deactivateAccount,
  reactivateAccount,
  getAccountTransactions,
};
