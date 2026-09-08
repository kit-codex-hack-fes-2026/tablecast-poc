ALTER TABLE table_sessions ADD COLUMN ui_section TEXT NOT NULL DEFAULT 'menu'
  CHECK (ui_section IN ('menu', 'cart', 'orders', 'bill'));
