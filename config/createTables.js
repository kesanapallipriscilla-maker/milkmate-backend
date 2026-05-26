require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const tables = [

  // ── TABLE 1: vendors ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS vendors (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(150)     NOT NULL,
    phone            VARCHAR(15)      NOT NULL UNIQUE,
    photo_url        TEXT,
    location_lat     DECIMAL(10, 7),
    location_lng     DECIMAL(10, 7),
    address          TEXT,
    milk_types       TEXT[]           DEFAULT '{}',
    price_per_litre  DECIMAL(8, 2),
    operating_hours  VARCHAR(100),
    rating           DECIMAL(3, 2)    DEFAULT 0.00,
    total_reviews    INTEGER          DEFAULT 0,
    is_open          BOOLEAN          DEFAULT TRUE,
    created_at       TIMESTAMP        DEFAULT NOW()
  )`,

  // ── TABLE 2: customers ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS customers (
    id               SERIAL PRIMARY KEY,
    vendor_id        INTEGER          NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name             VARCHAR(150)     NOT NULL,
    phone            VARCHAR(15)      NOT NULL,
    address          TEXT,
    milk_type        VARCHAR(50),
    quantity_morning DECIMAL(5, 2)    DEFAULT 0,
    quantity_evening DECIMAL(5, 2)    DEFAULT 0,
    schedule_days    TEXT[]           DEFAULT '{}',
    status           VARCHAR(20)      DEFAULT 'active'
                                      CHECK (status IN ('active', 'paused', 'stopped')),
    created_at       TIMESTAMP        DEFAULT NOW(),
    UNIQUE (vendor_id, phone)
  )`,

  // ── TABLE 3: deliveries ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS deliveries (
    id                 SERIAL PRIMARY KEY,
    customer_id        INTEGER      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vendor_id          INTEGER      NOT NULL REFERENCES vendors(id)   ON DELETE CASCADE,
    date               DATE         NOT NULL,
    slot               VARCHAR(10)  NOT NULL CHECK (slot IN ('morning', 'evening')),
    status             VARCHAR(20)  DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'delivered', 'skipped')),
    quantity_delivered DECIMAL(5, 2),
    note               TEXT,
    created_at         TIMESTAMP    DEFAULT NOW(),
    UNIQUE (customer_id, date, slot)
  )`,

  // ── TABLE 4: payments ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payments (
    id             SERIAL PRIMARY KEY,
    customer_id    INTEGER         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vendor_id      INTEGER         NOT NULL REFERENCES vendors(id)   ON DELETE CASCADE,
    amount         DECIMAL(10, 2)  NOT NULL,
    mode           VARCHAR(20)     NOT NULL CHECK (mode IN ('cash', 'upi', 'bank_transfer')),
    utr_reference  VARCHAR(100),
    balance_after  DECIMAL(10, 2),
    created_at     TIMESTAMP       DEFAULT NOW()
  )`,

  // ── TABLE 5: bills ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS bills (
    id               SERIAL PRIMARY KEY,
    customer_id      INTEGER         NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vendor_id        INTEGER         NOT NULL REFERENCES vendors(id)   ON DELETE CASCADE,
    month            SMALLINT        NOT NULL CHECK (month BETWEEN 1 AND 12),
    year             SMALLINT        NOT NULL,
    total_deliveries INTEGER         DEFAULT 0,
    total_amount     DECIMAL(10, 2)  DEFAULT 0,
    amount_paid      DECIMAL(10, 2)  DEFAULT 0,
    balance_due      DECIMAL(10, 2)  GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    generated_at     TIMESTAMP       DEFAULT NOW(),
    UNIQUE (customer_id, month, year)
  )`,

  // ── TABLE 6: reviews ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reviews (
    id                SERIAL PRIMARY KEY,
    vendor_id         INTEGER      NOT NULL REFERENCES vendors(id)   ON DELETE CASCADE,
    customer_id       INTEGER      NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    overall_stars     SMALLINT     NOT NULL CHECK (overall_stars BETWEEN 1 AND 5),
    quality_stars     SMALLINT     CHECK (quality_stars BETWEEN 1 AND 5),
    freshness_stars   SMALLINT     CHECK (freshness_stars BETWEEN 1 AND 5),
    punctuality_stars SMALLINT     CHECK (punctuality_stars BETWEEN 1 AND 5),
    behaviour_stars   SMALLINT     CHECK (behaviour_stars BETWEEN 1 AND 5),
    comment           TEXT,
    vendor_reply      TEXT,
    created_at        TIMESTAMP    DEFAULT NOW(),
    UNIQUE (vendor_id, customer_id)
  )`,

  // ── Indexes ──────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_customers_vendor   ON customers(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_vendor   ON deliveries(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_date     ON deliveries(date)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_customer   ON payments(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_vendor     ON payments(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_customer      ON bills(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_vendor      ON reviews(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vendors_location    ON vendors(location_lat, location_lng)`,
];

const TABLE_NAMES = [
  'vendors', 'customers', 'deliveries',
  'payments', 'bills', 'reviews', '(indexes)',
];

async function createTables() {
  console.log('\n──────────────────────────────────────');
  console.log(' MilkMate — Creating database tables');
  console.log('──────────────────────────────────────');

  const client = await pool.connect();
  try {
    for (let i = 0; i < tables.length; i++) {
      const label = TABLE_NAMES[i] ?? `statement ${i + 1}`;
      await client.query(tables[i]);
      console.log(`  ✔  ${label}`);
    }
    console.log('──────────────────────────────────────');
    console.log(' All tables created successfully!\n');
  } catch (err) {
    console.error('\n  ✘  Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createTables();
