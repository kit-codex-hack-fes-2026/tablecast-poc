ALTER TABLE organization ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE user ADD COLUMN stripe_customer_id TEXT;
CREATE TABLE subscription (
 id TEXT PRIMARY KEY, plan TEXT NOT NULL, reference_id TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT,
 status TEXT NOT NULL DEFAULT 'incomplete', period_start INTEGER, period_end INTEGER, cancel_at_period_end INTEGER DEFAULT 0,
 cancel_at INTEGER, canceled_at INTEGER, ended_at INTEGER, seats INTEGER, trial_start INTEGER, trial_end INTEGER,
 billing_interval TEXT, stripe_schedule_id TEXT
);
CREATE INDEX subscription_reference ON subscription(reference_id,status);
CREATE TABLE organization_ai (
 organization_id TEXT PRIMARY KEY REFERENCES organization(id), state TEXT NOT NULL DEFAULT 'pending', service_account_id TEXT,
 credential_id TEXT, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE organization_ai_keys (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL, service_account_id TEXT NOT NULL,
 encrypted_key TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX organization_ai_keys_org ON organization_ai_keys(organization_id,created_at);
CREATE TABLE voice_usage_sessions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, store_id TEXT NOT NULL, table_session_id TEXT NOT NULL,
 credential_id TEXT, started_at INTEGER NOT NULL, seconds REAL NOT NULL DEFAULT 0, charge_micros INTEGER NOT NULL DEFAULT 0,
 final INTEGER NOT NULL DEFAULT 0, started INTEGER NOT NULL DEFAULT 0, billable INTEGER NOT NULL DEFAULT 0, measurement_failed INTEGER NOT NULL DEFAULT 0, pricing_version TEXT NOT NULL, rates_json TEXT NOT NULL,
 demo INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE INDEX voice_usage_org_period ON voice_usage_sessions(organization_id,started_at,id);
CREATE TABLE response_usage (
 id TEXT PRIMARY KEY, voice_session_id TEXT NOT NULL REFERENCES voice_usage_sessions(id), model TEXT NOT NULL,
 service_tier TEXT NOT NULL, input_tokens INTEGER NOT NULL, cached_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
 charge_micros INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX response_usage_session ON response_usage(voice_session_id);
CREATE TABLE billing_outbox (
 voice_session_id TEXT NOT NULL REFERENCES voice_usage_sessions(id), seconds REAL NOT NULL DEFAULT 0,
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, charge_micros INTEGER NOT NULL, created_at INTEGER NOT NULL,
 first_attempt_at INTEGER, sent_at INTEGER, state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX billing_outbox_pending ON billing_outbox(state,created_at,id);
CREATE TABLE organization_costs (
 id TEXT PRIMARY KEY, organization_id TEXT, api_key_id TEXT, day INTEGER NOT NULL, line_item TEXT NOT NULL,
 amount_usd TEXT NOT NULL, fetched_at INTEGER NOT NULL
);
CREATE INDEX organization_costs_org_day ON organization_costs(organization_id,day);
CREATE TABLE billing_sync (id TEXT PRIMARY KEY, completed_at INTEGER, failed_at INTEGER, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
INSERT INTO organization_ai(organization_id,updated_at) SELECT id,0 FROM organization;

CREATE TABLE billing_rate_versions (version text PRIMARY KEY NOT NULL, rates_json text NOT NULL);

CREATE INDEX billing_outbox_org_period ON billing_outbox(organization_id,created_at);
CREATE INDEX billing_outbox_session ON billing_outbox(voice_session_id,created_at);
