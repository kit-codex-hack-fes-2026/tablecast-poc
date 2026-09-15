-- 閉卓した店舗別の来店から注文・会計・呼出を集計するための索引。
CREATE INDEX tablecast_orders_statistics ON orders(store_id,table_session_id,status);
CREATE INDEX tablecast_payments_statistics ON payments(store_id,table_session_id,kind);
CREATE INDEX tablecast_events_statistics ON table_events(store_id,table_session_id,kind);
