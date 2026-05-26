const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/deliveries/today/:vendorId
router.get('/today/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const result = await db.query(
      `SELECT
         d.id, d.customer_id, d.vendor_id, d.date, d.slot,
         d.status, d.quantity_delivered, d.note, d.created_at,
         c.name AS "customerName", c.address, c.phone
       FROM deliveries d
       JOIN customers c ON c.id = d.customer_id
       WHERE d.vendor_id = $1 AND d.date = CURRENT_DATE
       ORDER BY d.slot, c.name`,
      [vendorId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/deliveries/today', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/deliveries/:vendorId?date=YYYY-MM-DD
router.get('/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { date } = req.query;
    const result = await db.query(
      `SELECT
         d.id, d.customer_id, d.vendor_id, d.date, d.slot,
         d.status, d.quantity_delivered, d.note, d.created_at,
         c.name AS "customerName", c.address, c.phone
       FROM deliveries d
       JOIN customers c ON c.id = d.customer_id
       WHERE d.vendor_id = $1
         AND ($2::date IS NULL OR d.date = $2::date)
       ORDER BY d.date DESC, d.slot, c.name`,
      [vendorId, date || null]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/deliveries/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/deliveries — create a delivery record
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { customer_id, vendor_id, date, slot, status, quantity_delivered, note } = req.body;
    if (!customer_id || !vendor_id || !slot) {
      return res.status(400).json({ success: false, message: 'customer_id, vendor_id and slot are required.' });
    }
    const result = await db.query(
      `INSERT INTO deliveries (customer_id, vendor_id, date, slot, status, quantity_delivered, note)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, COALESCE($5, 'pending'), $6, $7)
       ON CONFLICT (customer_id, date, slot)
         DO UPDATE SET status = EXCLUDED.status,
                       quantity_delivered = EXCLUDED.quantity_delivered,
                       note = EXCLUDED.note
       RETURNING *`,
      [customer_id, vendor_id, date || null, slot, status || 'pending', quantity_delivered || null, note || null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/deliveries', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/deliveries/:id/complete — mark delivery as done
router.put('/:id/complete', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity_delivered, note } = req.body;
    const result = await db.query(
      `UPDATE deliveries
       SET status = 'delivered',
           quantity_delivered = COALESCE($1, quantity_delivered)
       WHERE id = $2
       RETURNING *`,
      [quantity_delivered || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Delivery not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/deliveries/:id/complete', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/deliveries/:id/skip
router.put('/:id/skip', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE deliveries SET status = 'skipped' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Delivery not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/deliveries/:id/skip', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
