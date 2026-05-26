const express        = require('express');
const router         = express.Router();
const db             = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/reviews/:vendorId — all reviews for a vendor
router.get('/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const result = await db.query(
      `SELECT
         r.id, r.vendor_id, r.customer_id,
         r.overall_stars, r.quality_stars, r.freshness_stars,
         r.punctuality_stars, r.behaviour_stars,
         r.comment, r.vendor_reply, r.created_at,
         c.name AS "customerName"
       FROM reviews r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.vendor_id = $1
       ORDER BY r.created_at DESC`,
      [vendorId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/reviews/:vendorId', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/reviews — submit a review
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      vendor_id, customer_id,
      overall_stars, quality_stars, freshness_stars,
      punctuality_stars, behaviour_stars, comment,
    } = req.body;

    if (!vendor_id || !customer_id || !overall_stars) {
      return res.status(400).json({
        success: false,
        message: 'vendor_id, customer_id and overall_stars are required.',
      });
    }
    if (overall_stars < 1 || overall_stars > 5) {
      return res.status(400).json({ success: false, message: 'overall_stars must be between 1 and 5.' });
    }

    const result = await db.query(
      `INSERT INTO reviews
         (vendor_id, customer_id, overall_stars, quality_stars,
          freshness_stars, punctuality_stars, behaviour_stars, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (vendor_id, customer_id)
         DO UPDATE SET
           overall_stars     = EXCLUDED.overall_stars,
           quality_stars     = EXCLUDED.quality_stars,
           freshness_stars   = EXCLUDED.freshness_stars,
           punctuality_stars = EXCLUDED.punctuality_stars,
           behaviour_stars   = EXCLUDED.behaviour_stars,
           comment           = EXCLUDED.comment
       RETURNING *`,
      [vendor_id, customer_id, overall_stars,
       quality_stars || null, freshness_stars || null,
       punctuality_stars || null, behaviour_stars || null, comment || null]
    );

    // Update vendor's average rating
    await db.query(
      `UPDATE vendors SET
         rating       = (SELECT AVG(overall_stars) FROM reviews WHERE vendor_id = $1),
         total_reviews = (SELECT COUNT(*)           FROM reviews WHERE vendor_id = $1)
       WHERE id = $1`,
      [vendor_id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/reviews', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/reviews/:id/reply — vendor replies to a review
router.put('/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_reply } = req.body;
    if (!vendor_reply) {
      return res.status(400).json({ success: false, message: 'vendor_reply is required.' });
    }
    const result = await db.query(
      `UPDATE reviews SET vendor_reply = $1 WHERE id = $2 RETURNING *`,
      [vendor_reply, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/reviews/:id/reply', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/reviews/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM reviews WHERE id = $1 RETURNING id, vendor_id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }
    // Recalculate vendor rating after deletion
    await db.query(
      `UPDATE vendors SET
         rating        = COALESCE((SELECT AVG(overall_stars) FROM reviews WHERE vendor_id = $1), 0),
         total_reviews = (SELECT COUNT(*) FROM reviews WHERE vendor_id = $1)
       WHERE id = $1`,
      [result.rows[0].vendor_id]
    );
    return res.json({ success: true, message: 'Review deleted.' });
  } catch (err) {
    console.error('DELETE /api/reviews/:id', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
