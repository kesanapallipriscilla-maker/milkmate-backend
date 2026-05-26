const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// ── GET /api/customers/:vendorId ──────────────────────────────────────────────
// Returns all customers for a vendor, ordered by name.
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
    console.error('GET /api/customers/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/customers ───────────────────────────────────────────────────────
// Creates a new customer. Accepts both camelCase (mobile) and snake_case keys.
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('POST /api/customers - body:', JSON.stringify(req.body));
    console.log('POST /api/customers - req.userId:', req.userId);

    const b = req.body;

    // Accept camelCase (from mobile) or snake_case
    const vendorId     = b.vendor_id        ?? b.vendorId        ?? req.userId;
    const name         = b.name?.trim();
    const phone        = b.phone?.trim();
    const address      = b.address?.trim()  ?? '';
    const milkType     = b.milk_type        ?? b.milkType        ?? 'Cow';
    const qtyMorning   = parseFloat(b.quantity_morning ?? b.morningQty  ?? 0);
    const qtyEvening   = parseFloat(b.quantity_evening ?? b.eveningQty  ?? 0);
    const scheduleDays = b.schedule_days    ?? b.deliveryDays    ?? [];

    console.log('POST /api/customers - parsed values:', { vendorId, name, phone, address, milkType, qtyMorning, qtyEvening, scheduleDays });

    // Validate required fields
    if (!name)     { console.log('Validation failed: name missing');     return res.status(400).json({ success: false, message: 'Customer name is required.' }); }
    if (!phone)    { console.log('Validation failed: phone missing');    return res.status(400).json({ success: false, message: 'Phone number is required.' }); }
    if (!address)  { console.log('Validation failed: address missing');  return res.status(400).json({ success: false, message: 'Delivery address is required.' }); }
    if (!vendorId) { console.log('Validation failed: vendorId missing'); return res.status(400).json({ success: false, message: 'Vendor ID is required.' }); }

    console.log('POST /api/customers - running INSERT...');

    const result = await db.query(
      `INSERT INTO customers
         (vendor_id, name, phone, address, milk_type,
          quantity_morning, quantity_evening, schedule_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id, vendor_id, name, phone, address,
         milk_type        AS "milkType",
         quantity_morning AS "quantityMorning",
         quantity_evening AS "quantityEvening",
         schedule_days    AS "deliveryDays",
         status, created_at`,
      [vendorId, name, phone, address, milkType, qtyMorning, qtyEvening, scheduleDays]
    );

    console.log('POST /api/customers - INSERT success, id:', result.rows[0].id);
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/customers - ERROR:', err.message);
    console.error('POST /api/customers - ERROR code:', err.code);
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists for this vendor.',
      });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/customers/:id ────────────────────────────────────────────────────
// Updates a customer. Only updates fields that are provided.
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const name         = b.name?.trim()       ?? null;
    const phone        = b.phone?.trim()      ?? null;
    const address      = b.address?.trim()    ?? null;
    const milkType     = b.milk_type          ?? b.milkType    ?? null;
    const qtyMorning   = b.quantity_morning   != null ? parseFloat(b.quantity_morning)
                       : b.morningQty         != null ? parseFloat(b.morningQty)
                       : null;
    const qtyEvening   = b.quantity_evening   != null ? parseFloat(b.quantity_evening)
                       : b.eveningQty         != null ? parseFloat(b.eveningQty)
                       : null;
    const scheduleDays = b.schedule_days      ?? b.deliveryDays ?? null;
    const status       = b.status             ?? null;

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
      [name, phone, address, milkType, qtyMorning, qtyEvening, scheduleDays, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/customers/:id', err.message);
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists for this vendor.',
      });
    }
    return res.status(500).json({ success: false, message: err.message });
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
    console.error('DELETE /api/customers/:id', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
