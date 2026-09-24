-- =====================================================================
-- Vanta Paper Trader — MySQL 8 Migration
-- =====================================================================
-- Target: MySQL 8.0+
-- All UUIDs stored as CHAR(36) hex strings.
-- No PostgreSQL-specific syntax (no gen_random_uuid, no jsonb, no auth.uid()).
-- =====================================================================

-- Schema migration tracking table (matches scripts/migrate.mjs format)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id CHAR(36) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- USERS
-- =====================================================================
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner', 'manager', 'caller', 'sales') NOT NULL DEFAULT 'caller',
  display_name VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_email ON users(email);

-- =====================================================================
-- API KEYS
-- =====================================================================
CREATE TABLE api_keys (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  key_id VARCHAR(80) NOT NULL,
  secret_hash CHAR(64) NOT NULL,
  label VARCHAR(80),
  last_used_at DATETIME(3),
  revoked_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_api_keys_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_id ON api_keys(key_id);
CREATE INDEX idx_api_keys_account ON api_keys(account_id);

-- =====================================================================
-- SESSIONS
-- =====================================================================
CREATE TABLE sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- =====================================================================
-- COMPETITIONS
-- =====================================================================
CREATE TABLE competitions (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  starting_cash DECIMAL(18,4) NOT NULL DEFAULT 10000.0000,
  start_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  end_date DATETIME(3),
  status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_competitions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_competitions_status ON competitions(status);

-- Seed default competition
INSERT INTO competitions (id, name, description, starting_cash, is_default, status)
SELECT '00000000-0000-0000-0000-000000000001', 'Club Sandbox', 'Always-on practice competition. Trade freely.', 10000.0000, TRUE, 'active'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM competitions WHERE is_default = TRUE);

-- =====================================================================
-- ACCOUNTS — one per (user, competition)
-- =====================================================================
CREATE TABLE accounts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  competition_id CHAR(36) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  cash DECIMAL(18,4) NOT NULL DEFAULT 10000.0000,
  starting_cash DECIMAL(18,4) NOT NULL DEFAULT 10000.0000,
  equity DECIMAL(18,4) NOT NULL DEFAULT 10000.0000,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_accounts_competition FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_accounts_user_competition (user_id, competition_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_accounts_competition ON accounts(competition_id);

-- =====================================================================
-- POSITIONS — per-account holdings of assets
-- =====================================================================
CREATE TABLE positions (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  avg_entry_price DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_positions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_positions_account ON positions(account_id);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE UNIQUE INDEX idx_positions_account_symbol ON positions(account_id, symbol);

-- =====================================================================
-- ORDERS — submitted buy/sell orders with full lifecycle tracking
-- =====================================================================
CREATE TABLE orders (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  client_order_id VARCHAR(120),
  symbol VARCHAR(50) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  type ENUM('market', 'limit') NOT NULL DEFAULT 'market',
  qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  limit_price DECIMAL(18,4),
  status ENUM('new', 'filled', 'partially_filled', 'canceled', 'rejected', 'expired') NOT NULL DEFAULT 'new',
  filled_qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  filled_avg_price DECIMAL(18,4),
  reject_reason TEXT,
  time_in_force ENUM('gtc', 'day', 'ioc') NOT NULL DEFAULT 'gtc',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  filled_at DATETIME(3),
  canceled_at DATETIME(3),
  scheduled_at DATETIME(3),
  CONSTRAINT fk_orders_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_symbol ON orders(symbol);
CREATE INDEX idx_orders_scheduled ON orders(scheduled_at);
CREATE UNIQUE INDEX idx_orders_account_client_order ON orders(account_id, client_order_id) WHERE client_order_id IS NOT NULL;

-- =====================================================================
-- FILLS — execution records
-- =====================================================================
CREATE TABLE fills (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  price DECIMAL(18,4) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_fills_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_fills_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT chk_fills_qty_positive CHECK (qty > 0),
  CONSTRAINT chk_fills_price_positive CHECK (price > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fills_account ON fills(account_id, created_at DESC);
CREATE INDEX idx_fills_order ON fills(order_id);

-- =====================================================================
-- LEDGER — immutable fill records
-- =====================================================================
CREATE TABLE ledger (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  order_id CHAR(36),
  symbol VARCHAR(50) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  price DECIMAL(18,4) NOT NULL,
  total DECIMAL(18,4) NOT NULL,
  cash_after DECIMAL(18,4) NOT NULL,
  commission DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ledger_account ON ledger(account_id);
CREATE INDEX idx_ledger_order ON ledger(order_id);

-- =====================================================================
-- ASSETS — lookup table for all tradeable symbols with metadata
-- =====================================================================
CREATE TABLE assets (
  id CHAR(36) PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  industry VARCHAR(100),
  metadata JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_assets_symbol ON assets(symbol);

-- =====================================================================
-- QUOTES — cached price data from external feeds
-- =====================================================================
CREATE TABLE quotes (
  id CHAR(36) PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL UNIQUE,
  price DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  bid DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  ask DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_quotes_symbol ON quotes(symbol);

-- =====================================================================
-- WATCHLISTS — user-created watchlists of symbols
-- =====================================================================
CREATE TABLE watchlists (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  note TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_watchlists_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uk_watchlists_account_symbol (account_id, symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_watchlists_account ON watchlists(account_id, created_at DESC);

-- =====================================================================
-- CLUBS — user groups with rank/progression systems
-- =====================================================================
CREATE TABLE clubs (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tier_requirements JSON NOT NULL DEFAULT '{"tiers": [{"min_points": 0, "division_min": 1, "division_max": 3}, {"min_points": 1000, "division_min": 1, "division_max": 3}, {"min_points": 2500, "division_min": 1, "division_max": 3}, {"min_points": 5000, "division_min": 1, "division_max": 3}, {"min_points": 10000, "division_min": 1, "division_max": 3}], "divisions_per_tier": 3}',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SEASONS — competition cycles with rank resets
-- =====================================================================
CREATE TABLE seasons (
  id CHAR(36) PRIMARY KEY,
  club_id CHAR(36),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  end_date DATETIME(3),
  status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  rank_thresholds JSON NOT NULL DEFAULT '{"min_points_for_tier_1": 2500, "min_points_for_tier_2": 5000, "min_points_for_tier_3": 10000, "min_points_for_tier_4": 25000}',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_seasons_club FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_seasons_club ON seasons(club_id);
CREATE INDEX idx_seasons_status ON seasons(status);

-- =====================================================================
-- RANKS — per-account seasonal ranking
-- =====================================================================
CREATE TABLE ranks (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  season_id CHAR(36),
  tier INT NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),
  division INT NOT NULL DEFAULT 1 CHECK (division >= 1 AND division <= 3),
  rank_points DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  position_in_tier INT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ranks_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ranks_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  UNIQUE KEY uk_ranks_account_season (account_id, season_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ranks_account ON ranks(account_id);
CREATE INDEX idx_ranks_season ON ranks(season_id);

-- =====================================================================
-- RANK HISTORY — per-account rank snapshots
-- =====================================================================
CREATE TABLE rank_history (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  season_id CHAR(36),
  position INT NOT NULL,
  tier INT NOT NULL DEFAULT 1,
  division INT NOT NULL DEFAULT 1,
  rank_points DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_rank_history_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_rank_history_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rank_history_account ON rank_history(account_id, recorded_at DESC);
CREATE INDEX idx_rank_history_season_position ON rank_history(season_id, position);

-- =====================================================================
-- CHALLENGES — per-account challenge progress within a season
-- =====================================================================
CREATE TABLE challenges (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  season_id CHAR(36),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  current DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  status ENUM('active', 'completed', 'failed') NOT NULL DEFAULT 'active',
  completed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_challenges_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenges_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_challenges_account ON challenges(account_id);
CREATE INDEX idx_challenges_season ON challenges(season_id);

-- =====================================================================
-- ACHIEVEMENTS — per-account earned achievements/badges
-- =====================================================================
CREATE TABLE achievements (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  earned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_achievements_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_achievements_account ON achievements(account_id);

-- =====================================================================
-- QUEST POINTS — optional milestone recognition
-- =====================================================================
CREATE TABLE quest_points (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  quest_id VARCHAR(120) NOT NULL,
  cycle_id VARCHAR(120) NOT NULL,
  points INT NOT NULL DEFAULT 200 CHECK (points >= 0),
  claimed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_quest_points_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uk_quest_points_account_quest_cycle (account_id, quest_id, cycle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_quest_points_account ON quest_points(account_id);

-- =====================================================================
-- PRICES — historical price snapshots (for charting/P&L)
-- =====================================================================
CREATE TABLE prices (
  symbol VARCHAR(50) PRIMARY KEY,
  price DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  prev_close DECIMAL(18,6),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prices_updated_at ON prices(updated_at DESC);

-- =====================================================================
-- PREDICTION MARKETS — mirrored from Polymarket (read model)
-- =====================================================================
CREATE TABLE prediction_markets (
  id VARCHAR(120) PRIMARY KEY,
  question VARCHAR(1000) NOT NULL,
  category VARCHAR(100),
  yes_token_id VARCHAR(120),
  no_token_id VARCHAR(120),
  yes_price DECIMAL(4,4),
  no_price DECIMAL(4,4),
  volume_24h DECIMAL(18,2),
  end_date DATETIME(3),
  status ENUM('active', 'closed', 'resolved') NOT NULL DEFAULT 'active',
  resolved_outcome ENUM('yes', 'no'),
  settled_at DATETIME(3),
  image VARCHAR(500),
  url VARCHAR(500),
  metadata JSON,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pred_markets_status ON prediction_markets(status, volume_24h DESC);

-- =====================================================================
-- PREDICTION POSITIONS — one per (account, market, outcome)
-- =====================================================================
CREATE TABLE prediction_positions (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  market_id VARCHAR(120) NOT NULL,
  outcome ENUM('yes', 'no') NOT NULL,
  shares DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  avg_cost DECIMAL(4,4) NOT NULL DEFAULT 0.0000,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pred_pos_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_pred_pos_market FOREIGN KEY (market_id) REFERENCES prediction_markets(id) ON DELETE CASCADE,
  UNIQUE KEY uk_pred_pos_account_market_outcome (account_id, market_id, outcome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pred_pos_account ON prediction_positions(account_id);

-- =====================================================================
-- PREDICTION FILLS — immutable paper fills for predictions
-- =====================================================================
CREATE TABLE prediction_fills (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  market_id VARCHAR(120) NOT NULL,
  outcome ENUM('yes', 'no') NOT NULL,
  side ENUM('buy', 'sell', 'settle') NOT NULL,
  shares DECIMAL(18,4) NOT NULL,
  price DECIMAL(4,4) NOT NULL,
  total DECIMAL(18,4) NOT NULL,
  cash_after DECIMAL(18,4) NOT NULL,
  client_order_id VARCHAR(120),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pred_fills_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_pred_fills_market FOREIGN KEY (market_id) REFERENCES prediction_markets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pred_fills_account ON prediction_fills(account_id, created_at DESC);
CREATE UNIQUE INDEX uniq_pred_fills_client_order ON prediction_fills(account_id, client_order_id) WHERE client_order_id IS NOT NULL;

-- =====================================================================
-- BUSINESSES — agent-managed business listings
-- =====================================================================
CREATE TABLE businesses (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  website VARCHAR(500),
  contact_email VARCHAR(254),
  contact_phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_businesses_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_businesses_account ON businesses(account_id);
CREATE INDEX idx_businesses_is_active ON businesses(is_active) WHERE is_active = TRUE;

-- =====================================================================
-- SOCIAL BLOCKS — user-to-user blocking
-- =====================================================================
CREATE TABLE social_blocks (
  id CHAR(36) PRIMARY KEY,
  blocker_account_id CHAR(36) NOT NULL,
  blocked_account_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_social_blocks_blocker FOREIGN KEY (blocker_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_blocks_blocked FOREIGN KEY (blocked_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uk_social_blocks_pair (blocker_account_id, blocked_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SOCIAL REPORTS — user reports
-- =====================================================================
CREATE TABLE social_reports (
  id CHAR(36) PRIMARY KEY,
  reporter_account_id CHAR(36) NOT NULL,
  target_account_id CHAR(36) NOT NULL,
  reason TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_social_reports_reporter FOREIGN KEY (reporter_account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_social_reports_target ON social_reports(target_account_id);

-- =====================================================================
-- ALERTS — user notifications
-- =====================================================================
CREATE TABLE alerts (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_alerts_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_alerts_account ON alerts(account_id, created_at DESC);

-- =====================================================================
-- MESSAGES — user-to-user messages
-- =====================================================================
CREATE TABLE messages (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  recipient_account_id CHAR(36) NOT NULL,
  subject VARCHAR(255),
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_messages_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_messages_account ON messages(account_id, created_at DESC);

-- =====================================================================
-- LEADERBOARD SNAPSHOT — periodic portfolio snapshots
-- =====================================================================
CREATE TABLE leaderboard_snapshot (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  equity DECIMAL(18,4) NOT NULL,
  snapshot_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_leaderboard_snapshot_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_leaderboard_snapshot_account ON leaderboard_snapshot(account_id, snapshot_at DESC);
