const { query } = require('../config/db');

const UPSERTABLE_FIELDS = [
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
 * GET /business/me  (requires auth)
 * Returns the caller's own business profile, or 404 if not created yet.
 */
async function getMyBusiness(req, res) {
  const { rows } = await query('SELECT * FROM businesses WHERE user_id = $1', [req.userId]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'No business profile yet.' });
  }
  res.json({ business: rows[0] });
}

/**
 * POST /business  (requires auth)
 * Creates the caller's business profile if it doesn't exist yet.
 * Onboarding step 2 — one business per user, enforced by the DB unique
 * constraint on businesses.user_id.
 */
async function createMyBusiness(req, res) {
  const existing = await query('SELECT id FROM businesses WHERE user_id = $1', [req.userId]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Business profile already exists. Use PATCH /business/me to edit it.' });
  }

  const values = UPSERTABLE_FIELDS.map((field) => req.body[field] ?? null);

  const { rows } = await query(
    `INSERT INTO businesses (user_id, ${UPSERTABLE_FIELDS.join(', ')}, onboarding_complete)
     VALUES ($1, ${UPSERTABLE_FIELDS.map((_, i) => `$${i + 2}`).join(', ')}, TRUE)
     RETURNING *`,
    [req.userId, ...values]
  );

  res.status(201).json({ business: rows[0] });
}

/**
 * PATCH /business/me  (requires auth)
 * Partial update — only fields present in the body are changed.
 */
async function updateMyBusiness(req, res) {
  const fieldsToUpdate = UPSERTABLE_FIELDS.filter((field) => field in req.body);

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided.' });
  }

  const setClause = fieldsToUpdate.map((field, i) => `${field} = $${i + 2}`).join(', ');
  const values = fieldsToUpdate.map((field) => req.body[field]);

  const { rows } = await query(
    `UPDATE businesses SET ${setClause} WHERE user_id = $1 RETURNING *`,
    [req.userId, ...values]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'No business profile yet. Create one first with POST /business.' });
  }

  res.json({ business: rows[0] });
}

module.exports = { getMyBusiness, createMyBusiness, updateMyBusiness };
