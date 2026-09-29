const { query } = require('../config/db');

async function listClients(req, res) {
  const { search } = req.query;

  let sql = 'SELECT * FROM clients WHERE business_id = $1';
  const params = [req.business.id];

  if (search) {
    sql += ' AND (name ILIKE $2 OR email ILIKE $2)';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY name ASC';

  const { rows } = await query(sql, params);
  res.json({ clients: rows });
}

async function getClient(req, res) {
  const { rows } = await query('SELECT * FROM clients WHERE id = $1 AND business_id = $2', [
    req.params.id,
    req.business.id,
  ]);
  if (rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
  res.json({ client: rows[0] });
}

const FIELDS = [
  'name', 'email', 'phone',
  'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country',
];

async function createClient(req, res) {
  const values = FIELDS.map((f) => req.body[f] ?? null);
  const { rows } = await query(
    `INSERT INTO clients (business_id, ${FIELDS.join(', ')})
     VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(', ')})
     RETURNING *`,
    [req.business.id, ...values]
  );
  res.status(201).json({ client: rows[0] });
}

async function updateClient(req, res) {
  const fieldsToUpdate = FIELDS.filter((f) => f in req.body);
  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided.' });
  }
  const setClause = fieldsToUpdate.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fieldsToUpdate.map((f) => req.body[f]);

  const { rows } = await query(
    `UPDATE clients SET ${setClause} WHERE id = $1 AND business_id = $2 RETURNING *`,
    [req.params.id, req.business.id, ...values]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Client not found.' });
  res.json({ client: rows[0] });
}

async function deleteClient(req, res) {
  // Clients referenced by invoices are kept (invoices.client_id is
  // ON DELETE SET NULL) so deleting a client never breaks invoice history.
  const { rowCount } = await query('DELETE FROM clients WHERE id = $1 AND business_id = $2', [
    req.params.id,
    req.business.id,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'Client not found.' });
  res.status(204).send();
}

module.exports = { listClients, getClient, createClient, updateClient, deleteClient };
