const { query } = require('../config/db');

/**
 * Insert or update the stripe_accounts row for a business from a Stripe
 * Account object (whatever came back from account creation, retrieval, or
 * the account.updated webhook). Single source of truth for what "connected"
 * means: charges_enabled / payouts_enabled / details_submitted.
 */
async function upsertStripeAccountForBusiness(businessId, stripeAccount, onboardingType) {
  const { rows } = await query(
    `INSERT INTO stripe_accounts
       (business_id, stripe_account_id, onboarding_type, charges_enabled, payouts_enabled, details_submitted)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (business_id) DO UPDATE SET
       stripe_account_id = EXCLUDED.stripe_account_id,
       charges_enabled   = EXCLUDED.charges_enabled,
       payouts_enabled   = EXCLUDED.payouts_enabled,
       details_submitted = EXCLUDED.details_submitted
     RETURNING *`,
    [
      businessId,
      stripeAccount.id,
      onboardingType,
      stripeAccount.charges_enabled,
      stripeAccount.payouts_enabled,
      stripeAccount.details_submitted,
    ]
  );
  return rows[0];
}

/**
 * Same, but looked up by Stripe account ID (used by the account.updated
 * webhook, which doesn't know our internal business_id).
 */
async function updateStripeAccountByStripeId(stripeAccount) {
  const { rows } = await query(
    `UPDATE stripe_accounts SET
       charges_enabled   = $2,
       payouts_enabled   = $3,
       details_submitted = $4
     WHERE stripe_account_id = $1
     RETURNING *`,
    [stripeAccount.id, stripeAccount.charges_enabled, stripeAccount.payouts_enabled, stripeAccount.details_submitted]
  );
  return rows[0] || null;
}

module.exports = { upsertStripeAccountForBusiness, updateStripeAccountByStripeId };
