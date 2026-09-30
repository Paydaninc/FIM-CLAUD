const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  bootstrapAdmin,
  listAccounts,
  getAccount,
  updateAccountBusiness,
  deactivateAccount,
  reactivateAccount,
  getAccountTransactions,
} = require('../controllers/admin.controller');

const router = express.Router();

// Bootstrap deliberately doesn't require requireAdmin — you're not one yet.
// It self-limits to a single use (see the controller).
router.post('/bootstrap', requireAuth, bootstrapAdmin);

router.get('/accounts', requireAuth, requireAdmin, listAccounts);
router.get('/accounts/:userId', requireAuth, requireAdmin, getAccount);
router.patch('/accounts/:userId/business', requireAuth, requireAdmin, updateAccountBusiness);
router.post('/accounts/:userId/deactivate', requireAuth, requireAdmin, deactivateAccount);
router.post('/accounts/:userId/reactivate', requireAuth, requireAdmin, reactivateAccount);
router.get('/accounts/:userId/transactions', requireAuth, requireAdmin, getAccountTransactions);

module.exports = router;
