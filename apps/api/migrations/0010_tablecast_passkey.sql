CREATE TABLE passkey (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  public_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  transports TEXT,
  created_at INTEGER,
  aaguid TEXT
);
CREATE INDEX passkey_user_idx ON passkey(user_id);
CREATE UNIQUE INDEX passkey_credential_idx ON passkey(credential_id);
