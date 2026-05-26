const express = require('express');
const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ message: 'Auth route working' });
});

router.post('/send-otp', async (req, res) => {
  try {
    console.log('Send OTP called:', req.body);
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    console.log('Verify OTP called:', req.body);
    const { phone, otp } = req.body;
    if (otp === '123456') {
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token: 'test-jwt-token',
        role: 'vendor'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Invalid OTP'
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
