# Free Invoice Maker — Mobile app (Mobile Phase 1: scaffold + auth + business profile)

Expo **bare workflow** (not Expo Go) — required from day one since Tap to
Pay needs native modules that Expo Go doesn't support. `expo-dev-client` is
included so you get a custom dev client instead.

## What's actually built and working this phase
- Project scaffold (Expo bare, TypeScript, React Navigation)
- Typed API client (`src/api/`) covering **every backend endpoint built so
  far** — auth, business profile, Stripe Connect status, dashboard,
  clients, invoices, all five payment methods, refunds. Screens that don't
  exist yet can still be built against real, working functions.
- Auth: signup, login, JWT stored in `expo-secure-store` (not
  AsyncStorage — actual secure keychain/keystore storage)
- Business profile onboarding screen (onboarding step 2, exact fields from
  your spec)
- `RootNavigator`: a state machine driven entirely by auth state (logged
  out → business profile → Stripe connect → main app), matching your
  spec's onboarding order exactly. No screen manually navigates between
  these stages — complete a step, and the app moves itself to the next one.

## What's a placeholder, and why that's the honest thing to ship now
`StripeConnectPlaceholder` and `MainPlaceholder` exist so the navigator
compiles and the full flow — signup → business profile → (placeholder) →
(placeholder) → log out — is demoable **today**, rather than the whole app
being unbuildable until every screen is done. They're clearly labeled as
placeholders in their own source comments. Next phases replace them with
the real Stripe Connect screen (Account Links/OAuth in an in-app browser)
and the real Dashboard/Invoices/Clients/Settings tabs.

## Setup
```bash
cd mobile
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_API_BASE_URL and the Stripe publishable key
npx expo prebuild       # generates ios/ and android/ native projects — needs network, run this yourself
```

Then, with a device or simulator:
```bash
npx expo run:ios       # or: npx expo run:android
```

**I can't run any of this from here** — no simulator, no device, and this
sandbox has no network access to even run `npm install`. Everything above
is written to be syntactically correct and follow current Expo/RN/React
Navigation conventions, but it's untested until you build it. If something
doesn't compile, that's genuinely useful feedback — tell me the exact
error and I'll fix it.

## A note on package versions
`@stripe/stripe-terminal-react-native`'s version in `package.json` is a
reasonable guess, not a verified-current one — I don't have web access
from here to check npm for the latest release. Run `npm info
@stripe/stripe-terminal-react-native versions` yourself before installing,
or just let `npm install` fail loudly if the pin is wrong and tell me the
actual latest version.

## Trying the flow
1. Sign up with a new email — you should land on the business profile screen.
2. Fill it in and continue — you should land on the Stripe Connect placeholder.
3. Since Stripe isn't actually connected yet, you're stuck there — that's
   correct/expected until the next phase's real screen exists. If you want
   to see the Main placeholder now, temporarily flip your test business's
   Stripe status to "ready" directly in Postgres, or wait for the real
   Connect screen.

## What's next
The real Stripe Connect screen (Create new account / Connect existing
account, hosted onboarding in an in-app browser, deep-link handling for
the return), then Dashboard, then Invoice list/create/edit/detail with all
five payment collection methods wired to Stripe's actual SDKs, then
Clients and Settings.
