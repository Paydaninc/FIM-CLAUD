const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const {
  getMyBusiness,
  createMyBusiness,
  updateMyBusiness,
} = require('../controllers/business.controller');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  }
  next();
}

const createValidators = [
  body('business_name').trim().notEmpty().withMessage('Business name is required.'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Business email must be valid.'),
  body('default_tax_rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Default tax rate must be between 0 and 100.'),
];

router.get('/me', requireAuth, getMyBusiness);
router.post('/', requireAuth, createValidators, validate, createMyBusiness);
router.patch('/me', requireAuth, updateMyBusiness);

module.exports = router;
