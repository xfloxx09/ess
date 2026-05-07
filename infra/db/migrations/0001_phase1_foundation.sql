CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  full_name TEXT NOT NULL,
  hourly_rate_eur NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_premiums (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  product_id UUID NOT NULL,
  amount_euro NUMERIC(10, 2) NOT NULL,
  UNIQUE (project_id, product_id)
);

CREATE TABLE IF NOT EXISTS sales_entries (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL,
  project_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INT NOT NULL,
  call_date DATE NOT NULL,
  contract_ref TEXT,
  order_ref TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS booking_types (
  id UUID PRIMARY KEY,
  label TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL,
  allows_split_shift BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS calendar_bookings (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL,
  date DATE NOT NULL,
  booking_type_id UUID NOT NULL,
  blocks_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
