const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  startExpressOnboarding,
  expressRefresh,
  expressReturn,
  startStandardOAuth,
  standardOAuthCallback,
  getConnectStatus,
} = require('../controllers/stripeConnect.controller');

const router = express.Router();

// Express (new Stripe account) path
router.post('/express/start', requireAuth, startExpressOnboarding);
router.get('/express/refresh', expressRefresh); // hit by Stripe's browser redirect, not the app directly
router.get('/express/return', expressReturn);   // same

// Standard (existing Stripe account) OAuth path
router.post('/standard/start', requireAuth, startStandardOAuth);
router.get('/standard/callback', standardOAuthCallback); // hit by Stripe's OAuth redirect

// Used by the app to decide whether to unlock payment features
router.get('/status', requireAuth, getConnectStatus);

module.exports = router;
