require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'MilkMate API is running' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',           require('./routes/auth'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/bills',      require('./routes/bills'));
app.use('/api/vendors',    require('./routes/vendors'));
app.use('/api/reviews',    require('./routes/reviews'));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MilkMate API running on port ${PORT}`);
});
