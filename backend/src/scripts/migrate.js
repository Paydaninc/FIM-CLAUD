/**
 * Minimal migration runner: applies every .sql file in src/migrations, in
 * filename order, that hasn't been applied yet. Tracks applied migrations
 * in a `schema_migrations` table so this is safe to run repeatedly.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ failed on ${file}:`, err.message);
        throw err;
      }
    }

    console.log('Migrations up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
