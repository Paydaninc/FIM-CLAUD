const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const { getConnectionToken } = require('../controllers/terminal.controller');

const router = express.Router();
router.post('/connection-token', requireAuth, requireBusiness, getConnectionToken);

module.exports = router;
