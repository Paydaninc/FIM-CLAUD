const { verifyAccessToken } = require('../utils/jwt');

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * On success, sets req.userId. Every protected route in this app relies on
 * this to scope queries to the authenticated user — never trust a userId
 * passed in the request body or query string.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
