const jwt = require('jsonwebtoken');
const stripe = require('../config/stripe');
const { query } = require('../config/db');
const { upsertStripeAccountForBusiness } = require('../services/stripeAccount.service');

async function getBusinessForUser(userId) {
  const { rows } = await query('SELECT * FROM businesses WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

function deepLink(path) {
  return `${process.env.APP_DEEP_LINK_SCHEME}://${path}`;
}

/**
 * POST /stripe/connect/express/start  (requires auth)
 * Creates an Express connected account (if one doesn't already exist for
 * this business) and an Account Link for hosted onboarding. Returns the
 * URL for the mobile app to open (in-app browser / WebView).
 */
async function startExpressOnboarding(req, res) {
  const business = await getBusinessForUser(req.userId);
  if (!business) {
    return res.status(400).json({ error: 'Create your business profile before connecting Stripe.' });
  }

  const existing = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [business.id]);
  let stripeAccountId;

  if (existing.rows.length > 0) {
    stripeAccountId = existing.rows[0].stripe_account_id;
  } else {
    const account = await stripe.accounts.create({
      type: 'express',
      country: business.country || 'US',
      email: business.email || undefined,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
    });
    stripeAccountId = account.id;
    await upsertStripeAccountForBusiness(business.id, account, 'express');
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${process.env.APP_BASE_URL}/stripe/connect/express/refresh?businessId=${business.id}`,
    return_url: `${process.env.APP_BASE_URL}/stripe/connect/express/return?businessId=${business.id}`,
    type: 'account_onboarding',
  });

  res.json({ onboardingUrl: accountLink.url });
}

/**
 * GET /stripe/connect/express/refresh
 * Account Links expire after a short time; Stripe sends the user back here
 * if that happens mid-flow, and we mint a fresh one.
 */
async function expressRefresh(req, res) {
  const { businessId } = req.query;
  const { rows } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [businessId]);
  if (rows.length === 0) {
    return res.redirect(deepLink('stripe-connect-error'));
  }

  const accountLink = await stripe.accountLinks.create({
    account: rows[0].stripe_account_id,
    refresh_url: `${process.env.APP_BASE_URL}/stripe/connect/express/refresh?businessId=${businessId}`,
    return_url: `${process.env.APP_BASE_URL}/stripe/connect/express/return?businessId=${businessId}`,
    type: 'account_onboarding',
  });

  res.redirect(accountLink.url);
}

/**
 * GET /stripe/connect/express/return
 * Stripe sends the user's browser here after hosted onboarding (whether or
 * not they actually finished it — we always re-check the account's real
 * status rather than assuming success). Hands back to the app via deep link.
 */
async function expressReturn(req, res) {
  const { businessId } = req.query;
  const { rows } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [businessId]);
  if (rows.length === 0) {
    return res.redirect(deepLink('stripe-connect-error'));
  }

  const account = await stripe.accounts.retrieve(rows[0].stripe_account_id);
  await upsertStripeAccountForBusiness(businessId, account, 'express');

  res.redirect(deepLink(`stripe-connect-return?complete=${account.charges_enabled && account.payouts_enabled}`));
}

/**
 * POST /stripe/connect/standard/start  (requires auth)
 * Returns the Stripe OAuth authorize URL for "connect my existing account".
 * `state` is a short-lived signed JWT (not a DB row) carrying the business
 * id, so the callback can verify it wasn't tampered with or replayed stale.
 */
async function startStandardOAuth(req, res) {
  const business = await getBusinessForUser(req.userId);
  if (!business) {
    return res.status(400).json({ error: 'Create your business profile before connecting Stripe.' });
  }

  const state = jwt.sign({ businessId: business.id }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const url = new URL('https://connect.stripe.com/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.STRIPE_CONNECT_CLIENT_ID);
  url.searchParams.set('scope', 'read_write');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', `${process.env.APP_BASE_URL}/stripe/connect/standard/callback`);

  res.json({ onboardingUrl: url.toString() });
}

/**
 * GET /stripe/connect/standard/callback
 * Stripe redirects here with ?code=...&state=... after the merchant logs
 * into their existing Stripe account and approves the connection.
 */
async function standardOAuthCallback(req, res) {
  const { code, state, error: stripeError } = req.query;

  if (stripeError) {
    // e.g. user clicked "deny" on Stripe's consent screen.
    return res.redirect(deepLink(`stripe-connect-error?reason=${encodeURIComponent(stripeError)}`));
  }

  let businessId;
  try {
    ({ businessId } = jwt.verify(state, process.env.JWT_SECRET));
  } catch (err) {
    return res.redirect(deepLink('stripe-connect-error?reason=invalid_state'));
  }

  // Exchange the one-time code for the connected account's Stripe user ID.
  const tokenResponse = await stripe.oauth.token({
    grant_type: 'authorization_code',
    code,
  });

  const account = await stripe.accounts.retrieve(tokenResponse.stripe_user_id);
  await upsertStripeAccountForBusiness(businessId, account, 'standard');

  res.redirect(deepLink(`stripe-connect-return?complete=${account.charges_enabled && account.payouts_enabled}`));
}

/**
 * GET /stripe/connect/status  (requires auth)
 * The app polls this after returning from the onboarding browser flow, and
 * uses it to gate payment-collection features (per your spec: block "Send
 * for Payment" until charges_enabled is true).
 */
async function getConnectStatus(req, res) {
  const business = await getBusinessForUser(req.userId);
  if (!business) {
    return res.status(400).json({ error: 'No business profile yet.' });
  }

  const { rows } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [business.id]);
  if (rows.length === 0) {
    return res.json({ connected: false });
  }

  const acct = rows[0];
  res.json({
    connected: true,
    onboardingType: acct.onboarding_type,
    chargesEnabled: acct.charges_enabled,
    payoutsEnabled: acct.payouts_enabled,
    detailsSubmitted: acct.details_submitted,
    readyForPayments: acct.charges_enabled && acct.payouts_enabled,
  });
}

module.exports = {
  startExpressOnboarding,
  expressRefresh,
  expressReturn,
  startStandardOAuth,
  standardOAuthCallback,
  getConnectStatus,
};
