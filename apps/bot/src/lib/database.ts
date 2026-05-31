import Database from 'better-sqlite3';
import { logger } from './logger.js';

const DB_PATH = process.env['DB_PATH'] ?? './data/arbitrage.db';

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    initSchema();
    logger.info(`📦 SQLite database initialized at ${DB_PATH}`);
  }
  return db;
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      pair TEXT NOT NULL,
      buy_exchange TEXT NOT NULL,
      sell_exchange TEXT NOT NULL,
      buy_price TEXT NOT NULL,
      sell_price TEXT NOT NULL,
      gross_spread TEXT NOT NULL,
      net_profit TEXT NOT NULL,
      net_profit_percent TEXT NOT NULL,
      max_volume TEXT NOT NULL,
      estimated_slippage TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      executed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      exchange TEXT NOT NULL,
      pair TEXT NOT NULL,
      side TEXT NOT NULL,
      requested_quantity TEXT NOT NULL,
      filled_quantity TEXT NOT NULL,
      average_price TEXT NOT NULL,
      total_cost TEXT NOT NULL,
      fee_paid TEXT NOT NULL,
      status TEXT NOT NULL,
      executed_at INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_detected
      ON opportunities(detected_at DESC);

    CREATE INDEX IF NOT EXISTS idx_trades_executed
      ON trades(executed_at DESC);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('📦 Database closed');
  }
}
