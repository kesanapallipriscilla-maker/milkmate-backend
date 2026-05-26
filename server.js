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
app.use('/auth', require('./routes/auth'));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MilkMate API running on port ${PORT}`);
});
