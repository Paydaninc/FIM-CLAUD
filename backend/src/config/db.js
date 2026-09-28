const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  // Fail loudly at startup rather than limping along with an undefined connection.
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable SSL automatically for non-local hosts (e.g. RDS, Render, Railway).
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // Idle client errors (e.g. connection dropped by the server) — log, don't crash the process.
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
