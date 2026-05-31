import Decimal from 'decimal.js';
import type { ArbitrageOpportunity, SimulatedTrade } from '@arbitrage/shared';
import { getDatabase } from './database.js';
import { logger } from './logger.js';

/**
 * Repository — data access layer for SQLite persistence.
 * Provides typed insert/query methods for trades and opportunities.
 */

// ─── Inserts ─────────────────────────────────────────────────────────────────

export function insertOpportunity(opp: ArbitrageOpportunity): void {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO opportunities
        (id, type, pair, buy_exchange, sell_exchange, buy_price, sell_price,
         gross_spread, net_profit, net_profit_percent, max_volume,
         estimated_slippage, detected_at, executed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      opp.id,
      opp.type,
      opp.pair,
      opp.buyExchange,
      opp.sellExchange,
      opp.buyPrice.toString(),
      opp.sellPrice.toString(),
      opp.grossSpread.toString(),
      opp.netProfit.toString(),
      opp.netProfitPercent.toString(),
      opp.maxVolume.toString(),
      opp.estimatedSlippage.toString(),
      opp.detectedAt,
      opp.executed ? 1 : 0,
    );
  } catch (err) {
    logger.error(`DB insert opportunity failed: ${(err as Error).message}`);
  }
}

export function insertTrade(trade: SimulatedTrade & { profit?: Decimal }): void {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO trades
        (id, opportunity_id, exchange, pair, side, requested_quantity,
         filled_quantity, average_price, total_cost, fee_paid, status,
         executed_at, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      trade.id,
      trade.opportunityId,
      trade.exchange,
      trade.pair,
      trade.side,
      trade.requestedQuantity.toString(),
      trade.filledQuantity.toString(),
      trade.averagePrice.toString(),
      trade.totalCost.toString(),
      trade.feePaid.toString(),
      trade.status,
      trade.executedAt,
      trade.latencyMs,
    );
  } catch (err) {
    logger.error(`DB insert trade failed: ${(err as Error).message}`);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface TradeRow {
  id: string;
  opportunity_id: string;
  exchange: string;
  pair: string;
  side: string;
  filled_quantity: string;
  average_price: string;
  total_cost: string;
  fee_paid: string;
  executed_at: number;
  latency_ms: number;
}

export interface OpportunityRow {
  id: string;
  type: string;
  pair: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: string;
  sell_price: string;
  gross_spread: string;
  net_profit: string;
  net_profit_percent: string;
  max_volume: string;
  detected_at: number;
  executed: number;
}

export function getRecentTrades(limit = 50): TradeRow[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM trades ORDER BY executed_at DESC LIMIT ?
    `);
    return stmt.all(limit) as TradeRow[];
  } catch (err) {
    logger.error(`DB query trades failed: ${(err as Error).message}`);
    return [];
  }
}

export function getRecentOpportunities(limit = 100): OpportunityRow[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM opportunities ORDER BY detected_at DESC LIMIT ?
    `);
    return stmt.all(limit) as OpportunityRow[];
  } catch (err) {
    logger.error(`DB query opportunities failed: ${(err as Error).message}`);
    return [];
  }
}

export function getTradeStats(): { totalTrades: number; totalPnl: string } {
  try {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COUNT(*) as total_trades,
             COALESCE(SUM(CAST(total_cost AS REAL)), 0) as total_cost
      FROM trades
    `).get() as { total_trades: number; total_cost: number } | undefined;
    return {
      totalTrades: row?.total_trades ?? 0,
      totalPnl: '0',
    };
  } catch (err) {
    logger.error(`DB query stats failed: ${(err as Error).message}`);
    return { totalTrades: 0, totalPnl: '0' };
  }
}

/** Purge old data keeping only the most recent N rows per table */
export function purgeOldData(keepTrades = 500, keepOpps = 1000): void {
  try {
    const db = getDatabase();
    db.prepare(`
      DELETE FROM trades WHERE id NOT IN (
        SELECT id FROM trades ORDER BY executed_at DESC LIMIT ?
      )
    `).run(keepTrades);
    db.prepare(`
      DELETE FROM opportunities WHERE id NOT IN (
        SELECT id FROM opportunities ORDER BY detected_at DESC LIMIT ?
      )
    `).run(keepOpps);
  } catch (err) {
    logger.error(`DB purge failed: ${(err as Error).message}`);
  }
}
