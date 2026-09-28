/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, next) {
  console.error(err);

  // Postgres unique_violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal server error.' : err.message;
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
