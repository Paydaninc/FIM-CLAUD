const stripe = require('../config/stripe');
const { query } = require('../config/db');

/**
 * POST /stripe/terminal/connection-token  (requires auth + business)
 *
 * The mobile app calls this once at Terminal SDK init time. Both the
 * Location and the ConnectionToken are created **on the connected
 * account** (`{stripeAccount}`) — Tap to Pay charges are direct charges
 * on the merchant's account, same as every other payment method here, so
 * the reader/location has to live there too, not on the platform account.
 *
 * The Location is created once and cached on stripe_accounts; every
 * subsequent call reuses it.
 */
async function getConnectionToken(req, res) {
  const { rows } = await query('SELECT * FROM stripe_accounts WHERE business_id = $1', [req.business.id]);
  const acct = rows[0];
  if (!acct || !acct.charges_enabled) {
    return res.status(400).json({ error: 'Finish connecting Stripe (charges are not enabled yet) before using Tap to Pay.' });
  }

  let locationId = acct.terminal_location_id;
  if (!locationId) {
    // NOTE: Stripe requires a complete, valid address here. If the business
    // profile is missing address fields, this call will fail with a clear
    // Stripe error — surfaced as-is rather than silently guessed at.
    const location = await stripe.terminal.locations.create(
      {
        display_name: req.business.business_name,
        address: {
          line1: req.business.address_line1,
          line2: req.business.address_line2 || undefined,
          city: req.business.city,
          state: req.business.state,
          postal_code: req.business.postal_code,
          country: req.business.country || 'US',
        },
      },
      { stripeAccount: acct.stripe_account_id }
    );
    locationId = location.id;
    await query('UPDATE stripe_accounts SET terminal_location_id = $1 WHERE id = $2', [locationId, acct.id]);
  }

  const connectionToken = await stripe.terminal.connectionTokens.create(
    {},
    { stripeAccount: acct.stripe_account_id }
  );

  res.json({ secret: connectionToken.secret, locationId, connectedAccountId: acct.stripe_account_id });
}

module.exports = { getConnectionToken };
