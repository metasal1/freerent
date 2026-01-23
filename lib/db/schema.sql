-- FreeRent Database Schema for Turso

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  accounts_closed INTEGER DEFAULT 0,
  rent_recovered REAL DEFAULT 0,
  fee_paid REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'connect', 'close', 'batch_close'
  wallet_address TEXT,
  tx_signature TEXT,
  accounts_count INTEGER,
  rent_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_wallet ON events(wallet_address);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_stats_wallet ON stats(wallet_address);
