require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  release();
  console.log('Database connected successfully');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
