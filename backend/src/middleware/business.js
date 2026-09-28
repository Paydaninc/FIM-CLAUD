const { query } = require('../config/db');

/**
 * Requires the authenticated user to already have a business profile
 * (onboarding step 2). Attaches it as req.business so route handlers never
 * have to look it up themselves or trust a business_id from the client.
 */
async function requireBusiness(req, res, next) {
  const { rows } = await query('SELECT * FROM businesses WHERE user_id = $1', [req.userId]);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'Create your business profile first.' });
  }
  req.business = rows[0];
  next();
}

module.exports = { requireBusiness };
