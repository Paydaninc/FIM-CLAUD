const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { requireBusiness } = require('../middleware/business');
const {
  createInvoice, listInvoices, getInvoice, updateInvoice,
  duplicateInvoice, deleteInvoice, sendInvoice, voidInvoice, getInvoicePdf,
} = require('../controllers/invoices.controller');
const {
  payCash, createCardPaymentIntent, createPaymentLink, createAchPaymentIntent, createTapToPayIntent, refundInvoice,
} = require('../controllers/payments.controller');

const router = express.Router();
router.use(requireAuth, requireBusiness);

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  }
  next();
}

const lineItemValidators = [
  body('line_items').isArray({ min: 1 }).withMessage('At least one line item is required.'),
  body('line_items.*.description').trim().notEmpty().withMessage('Line item description is required.'),
  body('line_items.*.quantity').isFloat({ gt: 0 }).withMessage('Line item quantity must be positive.'),
  body('line_items.*.unit_price').isFloat({ min: 0 }).withMessage('Line item unit price must be >= 0.'),
];

router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.get('/:id/pdf', getInvoicePdf);
router.post('/', lineItemValidators, validate, createInvoice);
router.patch('/:id', updateInvoice);
router.post('/:id/duplicate', duplicateInvoice);
router.delete('/:id', deleteInvoice);
router.post('/:id/send', sendInvoice);
router.post('/:id/void', voidInvoice);
router.post('/:id/pay/cash', payCash);
router.post('/:id/pay/card/intent', createCardPaymentIntent);
router.post('/:id/pay/link', createPaymentLink);
router.post('/:id/pay/ach/intent', createAchPaymentIntent);
router.post('/:id/pay/tap-to-pay/intent', createTapToPayIntent);
router.post('/:id/refund', refundInvoice);

module.exports = router;
