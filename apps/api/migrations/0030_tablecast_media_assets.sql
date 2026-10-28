CREATE TABLE media_assets (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  image_key TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  blurhash TEXT NOT NULL,
  PRIMARY KEY (store_id, image_key)
);
