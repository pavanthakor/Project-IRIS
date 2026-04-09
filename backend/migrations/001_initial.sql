CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  api_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free','pro','enterprise'))
);

CREATE TABLE ioc_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ioc_value TEXT NOT NULL,
  ioc_type TEXT NOT NULL CHECK (ioc_type IN ('ip','domain','hash','email')),
  queried_at TIMESTAMPTZ DEFAULT NOW(),
  risk_score INT,
  cache_key TEXT UNIQUE,
  result_json JSONB
);

CREATE INDEX idx_ioc_value ON ioc_queries(ioc_value);
CREATE INDEX idx_user_history ON ioc_queries(user_id, queried_at DESC);

CREATE TABLE feed_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID REFERENCES ioc_queries(id) ON DELETE CASCADE,
  feed_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failed','timeout','cached')),
  raw_data JSONB,
  latency_ms INT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);