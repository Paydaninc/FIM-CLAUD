const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const {
  listClients, getClient, createClient, updateClient, deleteClient,
} = require('../controllers/clients.controller');

const router = express.Router();
router.use(requireAuth, requireBusiness);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  }
  next();
}

router.get('/', listClients);
router.get('/:id', getClient);
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Client name is required.'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email must be valid.'),
  ],
  validate,
  createClient
);
router.patch('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
