const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/payments/:vendorId — all payments for a vendor
router.get('/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { customer_id, limit = 50, offset = 0 } = req.query;
    const result = await db.query(
      `SELECT
         p.id, p.customer_id, p.vendor_id, p.amount,
         p.mode, p.utr_reference, p.balance_after, p.created_at,
         c.name AS "customerName", c.phone
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
       WHERE p.vendor_id = $1
         AND ($2::int IS NULL OR p.customer_id = $2::int)
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4`,
      [vendorId, customer_id || null, limit, offset]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/payments/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/payments/summary/:vendorId — dues + today collected
router.get('/summary/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const [duesResult, todayResult] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(balance_due), 0) AS "totalDues"
         FROM bills WHERE vendor_id = $1`,
        [vendorId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) AS "collectedToday"
         FROM payments
         WHERE vendor_id = $1 AND created_at::date = CURRENT_DATE`,
        [vendorId]
      ),
    ]);
    return res.json({
      success: true,
      data: {
        totalDues:      parseFloat(duesResult.rows[0].totalDues),
        collectedToday: parseFloat(todayResult.rows[0].collectedToday),
      },
    });
  } catch (err) {
    console.error('GET /api/payments/summary/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments — record a payment
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { customer_id, vendor_id, amount, mode, utr_reference, balance_after } = req.body;

    if (!customer_id || !vendor_id || !amount || !mode) {
      return res.status(400).json({
        success: false,
        message: 'customer_id, vendor_id, amount and mode are required.',
      });
    }
    const validModes = ['cash', 'upi', 'bank_transfer'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `mode must be one of: ${validModes.join(', ')}`,
      });
    }

    const result = await db.query(
      `INSERT INTO payments (customer_id, vendor_id, amount, mode, utr_reference, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [customer_id, vendor_id, amount, mode, utr_reference || null, balance_after || null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/payments', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/payments/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM payments WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    }
    return res.json({ success: true, message: 'Payment deleted.' });
  } catch (err) {
    console.error('DELETE /api/payments/:id', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
