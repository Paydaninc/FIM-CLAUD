const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const { getDashboard } = require('../controllers/dashboard.controller');

const router = express.Router();
router.get('/', requireAuth, requireBusiness, getDashboard);

module.exports = router;
