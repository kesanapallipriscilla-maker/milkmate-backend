const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/vendors — list all vendors (for customer map discovery)
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    let query, params;

    if (lat && lng) {
      // Return vendors within radius km using Haversine approximation
      query = `
        SELECT id, name, phone, photo_url, address,
               location_lat, location_lng, milk_types,
               price_per_litre, operating_hours, rating,
               total_reviews, is_open,
               (6371 * acos(
                 cos(radians($1)) * cos(radians(location_lat))
                 * cos(radians(location_lng) - radians($2))
                 + sin(radians($1)) * sin(radians(location_lat))
               )) AS distance_km
        FROM vendors
        WHERE is_open = TRUE
          AND location_lat IS NOT NULL
        HAVING (6371 * acos(
                  cos(radians($1)) * cos(radians(location_lat))
                  * cos(radians(location_lng) - radians($2))
                  + sin(radians($1)) * sin(radians(location_lat))
                )) <= $3
        ORDER BY distance_km`;
      params = [parseFloat(lat), parseFloat(lng), parseFloat(radius)];
    } else {
      query  = `SELECT id, name, phone, photo_url, address,
                       location_lat, location_lng, milk_types,
                       price_per_litre, operating_hours, rating,
                       total_reviews, is_open
                FROM vendors ORDER BY rating DESC`;
      params = [];
    }

    const result = await db.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/vendors', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendors/:id — single vendor profile
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, phone, photo_url, address,
              location_lat, location_lng, milk_types,
              price_per_litre, operating_hours, rating,
              total_reviews, is_open, created_at
       FROM vendors WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /api/vendors/:id', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/vendors — register a new vendor
router.post('/', async (req, res) => {
  try {
    const {
      name, phone, photo_url, address,
      location_lat, location_lng, milk_types,
      price_per_litre, operating_hours,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'name and phone are required.' });
    }

    const result = await db.query(
      `INSERT INTO vendors
         (name, phone, photo_url, address, location_lat, location_lng,
          milk_types, price_per_litre, operating_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [name, phone, photo_url || null, address || null,
       location_lat || null, location_lng || null,
       milk_types || [], price_per_litre || null, operating_hours || null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/vendors', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A vendor with this phone number already exists.' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/vendors/:id — update vendor profile
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, photo_url, address, location_lat, location_lng,
      milk_types, price_per_litre, operating_hours, is_open,
    } = req.body;

    const result = await db.query(
      `UPDATE vendors SET
         name             = COALESCE($1,  name),
         photo_url        = COALESCE($2,  photo_url),
         address          = COALESCE($3,  address),
         location_lat     = COALESCE($4,  location_lat),
         location_lng     = COALESCE($5,  location_lng),
         milk_types       = COALESCE($6,  milk_types),
         price_per_litre  = COALESCE($7,  price_per_litre),
         operating_hours  = COALESCE($8,  operating_hours),
         is_open          = COALESCE($9,  is_open)
       WHERE id = $10
       RETURNING *`,
      [name, photo_url, address, location_lat, location_lng,
       milk_types, price_per_litre, operating_hours, is_open, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/vendors/:id', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/vendors/:id/dashboard — summary stats for vendor home screen
router.get('/:id/dashboard', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [customers, pending, revenue] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total FROM customers WHERE vendor_id = $1 AND status = 'active'`, [id]),
      db.query(`SELECT COUNT(*) AS total FROM deliveries WHERE vendor_id = $1 AND date = CURRENT_DATE AND status = 'pending'`, [id]),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payments WHERE vendor_id = $1 AND created_at::date = CURRENT_DATE`,
        [id]
      ),
    ]);
    return res.json({
      success: true,
      data: {
        totalCustomers:    parseInt(customers.rows[0].total),
        pendingDeliveries: parseInt(pending.rows[0].total),
        todayRevenue:      parseFloat(revenue.rows[0].total),
      },
    });
  } catch (err) {
    console.error('GET /api/vendors/:id/dashboard', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
