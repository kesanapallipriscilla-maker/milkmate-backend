const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Auth route working' });
});

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    console.log('Send OTP called for phone:', phone);
    // TODO: integrate Firebase / SMS provider here
    return res.status(200).json({ success: true, message: 'OTP sent successfully.' });
  } catch (error) {
    console.error('send-otp error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
    }

    console.log('Verify OTP called:', { phone, otp });

    // TODO: verify OTP via Firebase / SMS provider
    // For now accept '123456' as the test OTP
    if (otp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }

    const token = jwt.sign(
      {
        userId: 1,
        phone:  phone,
        role:   'vendor',
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success:  true,
      message:  'Login successful',
      token:    token,
      role:     'vendor',
      userId:   1,
      vendorId: 1,
    });
  } catch (error) {
    console.error('verify-otp error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
