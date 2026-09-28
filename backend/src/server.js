require('dotenv').config();

// Hosts like Render expose the service's public URL as RENDER_EXTERNAL_URL.
// APP_BASE_URL (used in Stripe return URLs and email links) falls back to it.
if (!process.env.APP_BASE_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.APP_BASE_URL = process.env.RENDER_EXTERNAL_URL;
}

const app = require('./app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Free Invoice Maker API listening on port ${PORT}`);
});
