const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { signup, login, verifyEmail, me } = require('../controllers/auth.controller');

const router = express.Router();

// Slow down brute-force attempts against login/signup specifically.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  }
  next();
}

router.post(
  '/signup',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.'),
  ],
  validate,
  signup
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('password').notEmpty().withMessage('Password required.'),
  ],
  validate,
  login
);

router.get('/verify-email', verifyEmail);

router.get('/me', requireAuth, me);

module.exports = router;
