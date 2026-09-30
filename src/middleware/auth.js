const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../config/db');

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success, sets req.userId. Every protected route in this app relies on
 * this to scope queries to the authenticated user — never trust a userId
 * passed in the request body or query string.
 *
 * Also checks the account hasn't been deactivated by an admin. This costs one
 * extra query per request, but means a deactivation takes effect immediately —
 * even for a token issued before the deactivation — rather than only blocking
 * the next login.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  try {
    const payload = verifyAccessToken(token);
    const { rows } = await query('SELECT is_active FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0] || rows[0].is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Requires the authenticated user to be an admin (the app owner). Always
 * chain after requireAuth — this reads req.userId, which requireAuth sets.
 */
async function requireAdmin(req, res, next) {
  const { rows } = await query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]?.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
