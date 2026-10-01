const crypto = require('crypto');
const { query } = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { sendVerificationEmail } = require('../services/email.service');

const VERIFICATION_TOKEN_TTL_HOURS = 24;

/**
 * POST /auth/signup
 * Creates a user with a hashed password and an email-verification token,
 * and sends the verification email via SendGrid (if configured — see
 * services/email.service.js; if SendGrid isn't set up yet, the link is
 * still returned in the response so local dev/testing isn't blocked on it).
 */
async function signup(req, res) {
  const { email, password } = req.body;

  const passwordHash = await hashPassword(password);
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  const { rows } = await query(
    `INSERT INTO users (email, password_hash, email_verification_token, email_verification_expires)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, email_verified, created_at`,
    [email.toLowerCase(), passwordHash, verificationToken, verificationExpires]
  );

  const user = rows[0];
  const accessToken = signAccessToken(user.id);
  const verificationLink = `${process.env.APP_BASE_URL}/auth/verify-email?token=${verificationToken}`;

  const emailResult = await sendVerificationEmail(user, verificationLink);

  res.status(201).json({
    user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    accessToken,
    emailSent: emailResult.sent,
    // Always included for local testing convenience — harmless once email sending
    // works, essential while it doesn't.
    devOnlyEmailVerificationLink: verificationLink,
  });
}

/**
 * POST /auth/login
 */
async function login(req, res) {
  const { email, password } = req.body;

  const { rows } = await query(
    'SELECT id, email, password_hash, email_verified, is_active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  const user = rows[0];

  // Same error for "no such user" and "wrong password" — don't leak which one.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.is_active === false) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  const accessToken = signAccessToken(user.id);
  res.json({
    user: { id: user.id, email: user.email, emailVerified: user.email_verified },
    accessToken,
  });
}

/**
 * GET /auth/verify-email?token=...
 */
async function verifyEmail(req, res) {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Missing token.' });
  }

  const { rows } = await query(
    `UPDATE users
     SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL
     WHERE email_verification_token = $1 AND email_verification_expires > now()
     RETURNING id, email`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Invalid or expired verification token.' });
  }

  res.json({ message: 'Email verified.', user: rows[0] });
}

/**
 * GET /auth/me  (requires auth)
 */
async function me(req, res) {
  const { rows } = await query(
    'SELECT id, email, email_verified, is_admin, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user: rows[0] });
}

module.exports = { signup, login, verifyEmail, me };
