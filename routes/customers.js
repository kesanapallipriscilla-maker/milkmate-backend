const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// ── GET /api/customers/:vendorId ──────────────────────────────────────────────
router.get('/:vendorId', authMiddleware, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const result = await db.query(
      `SELECT
         id,
         vendor_id,
         name,
         phone,
         address,
         milk_type        AS "milkType",
         quantity_morning AS "quantityMorning",
         quantity_evening AS "quantityEvening",
         schedule_days    AS "deliveryDays",
         status,
         created_at
       FROM customers
       WHERE vendor_id = $1
       ORDER BY name ASC`,
      [vendorId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/customers/:vendorId error:', err);
    return res.status(500).json({ success: false, message: err.message || String(err) });
  }
});

// ── POST /api/customers ───────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('Creating customer:', JSON.stringify(req.body));
    console.log('Auth userId:', req.userId);

    const {
      vendor_id,
      name,
      phone,
      address,
      milkType,
      morningQty,
      eveningQty,
      deliveryDays,
      deliverySlot,
    } = req.body;

    // Validate required fields
    if (!name || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone and address are required.',
      });
    }

    const vendorIdFinal = vendor_id ?? req.userId;
    console.log('Using vendorId:', vendorIdFinal);
    console.log('deliveryDays:', deliveryDays);
    console.log('deliverySlot:', deliverySlot);

    const result = await db.query(
      `INSERT INTO customers
         (vendor_id, name, phone, address,
          milk_type, quantity_morning,
          quantity_evening, schedule_days,
          delivery_slot, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'active')
       RETURNING *`,
      [
        vendorIdFinal,
        name,
        phone,
        address,
        milkType      || 'Cow',
        morningQty    || 0,
        eveningQty    || 0,
        JSON.stringify(deliveryDays || []),
        deliverySlot  || 'Morning',
      ]
    );

    console.log('Customer created:', JSON.stringify(result.rows[0]));

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      data:    result.rows[0],
    });
  } catch (error) {
    console.error('Create customer error:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists for this vendor.',
      });
    }
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        message: `Foreign key violation: ${error.detail || 'vendor_id does not exist in vendors table.'}`,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || String(error),
    });
  }
});

// ── PUT /api/customers/:id ────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const name         = b.name?.trim()    ?? null;
    const phone        = b.phone?.trim()   ?? null;
    const address      = b.address?.trim() ?? null;
    const milkType     = b.milk_type       ?? b.milkType    ?? null;
    const qtyMorning   = b.quantity_morning != null ? parseFloat(b.quantity_morning)
                       : b.morningQty       != null ? parseFloat(b.morningQty)
                       : null;
    const qtyEvening   = b.quantity_evening != null ? parseFloat(b.quantity_evening)
                       : b.eveningQty       != null ? parseFloat(b.eveningQty)
                       : null;
    const scheduleDays = b.schedule_days   ?? b.deliveryDays ?? null;
    const status       = b.status          ?? null;

    const result = await db.query(
      `UPDATE customers SET
         name             = COALESCE($1, name),
         phone            = COALESCE($2, phone),
         address          = COALESCE($3, address),
         milk_type        = COALESCE($4, milk_type),
         quantity_morning = COALESCE($5, quantity_morning),
         quantity_evening = COALESCE($6, quantity_evening),
         schedule_days    = COALESCE($7, schedule_days),
         status           = COALESCE($8, status)
       WHERE id = $9
       RETURNING
         id, vendor_id, name, phone, address,
         milk_type        AS "milkType",
         quantity_morning AS "quantityMorning",
         quantity_evening AS "quantityEvening",
         schedule_days    AS "deliveryDays",
         status, created_at`,
      [name, phone, address, milkType, qtyMorning, qtyEvening,
       scheduleDays ? JSON.stringify(scheduleDays) : null, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/customers/:id error:', err);
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists for this vendor.',
      });
    }
    return res.status(500).json({ success: false, message: err.message || String(err) });
  }
});

// ── DELETE /api/customers/:id ─────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM customers WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    return res.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (err) {
    console.error('DELETE /api/customers/:id error:', err);
    return res.status(500).json({ success: false, message: err.message || String(err) });
  }
});

module.exports = router;
