CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{"high_risk_detected"}',
  min_risk_score INT DEFAULT 70,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  failure_count INT DEFAULT 0
);

CREATE INDEX idx_webhooks_user_active ON webhooks(user_id, is_active);
