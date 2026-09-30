require('express-async-errors'); // lets thrown errors in async route handlers reach errorHandler
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const businessRoutes = require('./routes/business.routes');
const stripeConnectRoutes = require('./routes/stripeConnect.routes');
const clientsRoutes = require('./routes/clients.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const terminalRoutes = require('./routes/terminal.routes');
const adminRoutes = require('./routes/admin.routes');
const stripeWebhook = require('./webhooks/stripe.webhook');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Running behind a hosting proxy (Render etc.): trust it so rate limiting sees real client IPs.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors()); // tighten to your mobile app's origin(s) in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// IMPORTANT: the Stripe webhook route needs the raw request body to verify
// the signature, so it's mounted with express.raw() *before* the global
// express.json() parser below — order here matters.
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Where Stripe Checkout sends a customer after they pay (or cancel) a payment link.
// Public on purpose: the customer isn't logged in. The invoice itself is updated
// by the Stripe webhook, never by this page.
app.get('/payment-result', (req, res) => {
  const ok = req.query.result === 'success';
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Payment received' : 'Payment cancelled'}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FAFAF8;color:#1A1A18;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{max-width:360px;text-align:center;padding:32px}.i{font-size:48px}h1{font-size:22px;margin:12px 0 8px}p{color:#6B6A64;line-height:1.5}</style></head>
<body><div class="c"><div class="i">${ok ? '&#10003;' : '&#10005;'}</div><h1>${ok ? 'Thank you — payment received' : 'Payment cancelled'}</h1>
<p>${ok ? 'Your payment was submitted. A receipt will be emailed to you. You can close this page.' : 'No payment was made. You can close this page, or use your payment link again.'}</p></div></body></html>`);
});

app.use('/auth', authRoutes);
app.use('/business', businessRoutes);
app.use('/stripe/connect', stripeConnectRoutes);
app.use('/clients', clientsRoutes);
app.use('/invoices', invoicesRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/stripe/terminal', terminalRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

module.exports = app;
