const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/bills/:vendorId?month=M&year=YYYY
router.get('/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { month, year, customer_id } = req.query;
    const result = await db.query(
      `SELECT
         b.id, b.customer_id, b.vendor_id, b.month, b.year,
         b.total_deliveries, b.total_amount, b.amount_paid,
         b.balance_due, b.generated_at,
         c.name AS "customerName", c.phone
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.vendor_id = $1
         AND ($2::int IS NULL OR b.month = $2::int)
         AND ($3::int IS NULL OR b.year  = $3::int)
         AND ($4::int IS NULL OR b.customer_id = $4::int)
       ORDER BY b.year DESC, b.month DESC, c.name`,
      [vendorId, month || null, year || null, customer_id || null]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/bills/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/bills/generate — generate bills for a vendor for a given month/year
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { vendor_id, month, year } = req.body;
    if (!vendor_id || !month || !year) {
      return res.status(400).json({ success: false, message: 'vendor_id, month and year are required.' });
    }

    // Calculate bill per customer from deliveries in that month
    const deliveriesResult = await db.query(
      `SELECT
         d.customer_id,
         COUNT(*) AS total_deliveries,
         SUM(COALESCE(d.quantity_delivered,
           CASE d.slot
             WHEN 'morning' THEN c.quantity_morning
             ELSE c.quantity_evening
           END
         ) * COALESCE(v.price_per_litre, 0)) AS total_amount
       FROM deliveries d
       JOIN customers c ON c.id = d.customer_id
       JOIN vendors   v ON v.id = d.vendor_id
       WHERE d.vendor_id = $1
         AND EXTRACT(MONTH FROM d.date) = $2
         AND EXTRACT(YEAR  FROM d.date) = $3
         AND d.status = 'delivered'
       GROUP BY d.customer_id`,
      [vendor_id, month, year]
    );

    const bills = [];
    for (const row of deliveriesResult.rows) {
      const paymentsResult = await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid
         FROM payments
         WHERE customer_id = $1
           AND vendor_id   = $2
           AND EXTRACT(MONTH FROM created_at) = $3
           AND EXTRACT(YEAR  FROM created_at) = $4`,
        [row.customer_id, vendor_id, month, year]
      );
      const amountPaid = parseFloat(paymentsResult.rows[0].paid);

      const upsert = await db.query(
        `INSERT INTO bills (customer_id, vendor_id, month, year, total_deliveries, total_amount, amount_paid)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (customer_id, month, year)
           DO UPDATE SET
             total_deliveries = EXCLUDED.total_deliveries,
             total_amount     = EXCLUDED.total_amount,
             amount_paid      = EXCLUDED.amount_paid,
             generated_at     = NOW()
         RETURNING *`,
        [row.customer_id, vendor_id, month, year,
         parseInt(row.total_deliveries), parseFloat(row.total_amount) || 0, amountPaid]
      );
      bills.push(upsert.rows[0]);
    }

    return res.status(201).json({
      success: true,
      message: `Generated ${bills.length} bill(s) for ${month}/${year}.`,
      data:    bills,
    });
  } catch (err) {
    console.error('POST /api/bills/generate', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/bills/:id/pay — record a payment against a bill
router.put('/:id/pay', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount_paid } = req.body;
    if (amount_paid === undefined) {
      return res.status(400).json({ success: false, message: 'amount_paid is required.' });
    }
    const result = await db.query(
      `UPDATE bills
       SET amount_paid = amount_paid + $1
       WHERE id = $2
       RETURNING *`,
      [parseFloat(amount_paid), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bill not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/bills/:id/pay', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
