import Decimal from 'decimal.js';
import type { ArbitrageOpportunity, ExchangeName } from '@arbitrage/shared';
import { MAX_BOOK_AGE_MS } from '@arbitrage/shared';
import { orderBookStore } from '../lib/store.js';
import { circuitBreaker } from './circuit-breaker.js';
import { walletManager } from './wallet-manager.js';
import { logger } from '../lib/logger.js';

/**
 * Risk Manager — validates opportunities before execution.
 *
 * Checks performed:
 * 1. Circuit breaker is not tripped
 * 2. Order book data is fresh (not stale)
 * 3. Prices are not anomalous (anti-false-positive)
 * 4. Opportunity still exists on re-check
 * 5. Volume meets minimum threshold
 * 6. Rate limit not exceeded (max trades per minute)
 * 7. Exposure limit per exchange not exceeded
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_TRADES_PER_MINUTE = 60;
const MIN_VOLUME_BTC = new Decimal('0.0001'); // 0.0001 BTC minimum
const MAX_EXPOSURE_PERCENT = new Decimal('0.50'); // Max 50% of wallet per trade
const COOLDOWN_SAME_PAIR_MS = 5000; // 5s between trades on same exchange pair

// ─── State ───────────────────────────────────────────────────────────────────

const tradeTimestamps: number[] = [];
const lastTradeByPair = new Map<string, number>();

export type RejectionReason =
  | 'circuit_breaker'
  | 'stale_data'
  | 'anomalous_price'
  | 'opportunity_gone'
  | 'volume_too_low'
  | 'rate_limited'
  | 'cooldown'
  | 'exposure_exceeded';

export interface ValidationResult {
  valid: boolean;
  reason?: RejectionReason;
  details?: string;
}

/**
 * Validate an arbitrage opportunity before allowing execution.
 */
export function validateOpportunity(opportunity: ArbitrageOpportunity): ValidationResult {
  // 1. Circuit breaker check
  if (circuitBreaker.isTripped) {
    return { valid: false, reason: 'circuit_breaker', details: circuitBreaker.getState().reason };
  }

  // 2. Freshness check — re-fetch books and verify age
  const buyBook = orderBookStore.get(opportunity.buyExchange, opportunity.pair);
  const sellBook = orderBookStore.get(opportunity.sellExchange, opportunity.pair);

  if (!buyBook || !sellBook) {
    return { valid: false, reason: 'stale_data', details: 'Order book not available' };
  }

  const now = Date.now();
  const buyAge = now - buyBook.localTimestamp;
  const sellAge = now - sellBook.localTimestamp;

  if (buyAge > MAX_BOOK_AGE_MS || sellAge > MAX_BOOK_AGE_MS) {
    return {
      valid: false,
      reason: 'stale_data',
      details: `Book age: buy=${buyAge}ms, sell=${sellAge}ms (max=${MAX_BOOK_AGE_MS}ms)`,
    };
  }

  // 3. Anomalous price detection
  if (circuitBreaker.isPriceAnomalous(opportunity.buyPrice)) {
    return {
      valid: false,
      reason: 'anomalous_price',
      details: `Buy price $${opportunity.buyPrice.toFixed(2)} is anomalous`,
    };
  }
  if (circuitBreaker.isPriceAnomalous(opportunity.sellPrice)) {
    return {
      valid: false,
      reason: 'anomalous_price',
      details: `Sell price $${opportunity.sellPrice.toFixed(2)} is anomalous`,
    };
  }

  // 4. Re-verify opportunity exists
  const bestAsk = buyBook.asks[0];
  const bestBid = sellBook.bids[0];
  if (!bestAsk || !bestBid || bestAsk.price.gte(bestBid.price)) {
    return { valid: false, reason: 'opportunity_gone', details: 'Spread no longer exists' };
  }

  // 5. Minimum volume
  if (opportunity.maxVolume.lt(MIN_VOLUME_BTC)) {
    return {
      valid: false,
      reason: 'volume_too_low',
      details: `Volume ${opportunity.maxVolume.toFixed(6)} BTC < min ${MIN_VOLUME_BTC}`,
    };
  }

  // 6. Rate limiting
  const oneMinuteAgo = now - 60_000;
  const recentTrades = tradeTimestamps.filter((t) => t > oneMinuteAgo);
  if (recentTrades.length >= MAX_TRADES_PER_MINUTE) {
    return {
      valid: false,
      reason: 'rate_limited',
      details: `${recentTrades.length}/${MAX_TRADES_PER_MINUTE} trades in last minute`,
    };
  }

  // 7. Cooldown between trades on same exchange pair
  const pairKey = `${opportunity.buyExchange}-${opportunity.sellExchange}-${opportunity.pair}`;
  const lastTrade = lastTradeByPair.get(pairKey);
  if (lastTrade && now - lastTrade < COOLDOWN_SAME_PAIR_MS) {
    return {
      valid: false,
      reason: 'cooldown',
      details: `${now - lastTrade}ms since last trade on this pair (min=${COOLDOWN_SAME_PAIR_MS}ms)`,
    };
  }

  // 8. Exposure check — max 50% of wallet per single trade
  const buyWallet = walletManager.getBalance(opportunity.buyExchange);
  if (buyWallet) {
    const tradeValueUsdt = opportunity.maxVolume.mul(opportunity.buyPrice);
    const walletValueUsdt = buyWallet.usdt.plus(buyWallet.btc.mul(opportunity.buyPrice));
    const exposurePercent = walletValueUsdt.isZero()
      ? new Decimal(100)
      : tradeValueUsdt.div(walletValueUsdt).mul(100);
    if (exposurePercent.gt(MAX_EXPOSURE_PERCENT.mul(100))) {
      return {
        valid: false,
        reason: 'exposure_exceeded',
        details: `Trade uses ${exposurePercent.toFixed(1)}% of wallet (max ${MAX_EXPOSURE_PERCENT.mul(100)}%)`,
      };
    }
  }

  return { valid: true };
}

/**
 * Record that a trade was executed (for rate limiting).
 */
export function recordTradeExecution(buyExchange: ExchangeName, sellExchange: ExchangeName, pair: string): void {
  const now = Date.now();
  tradeTimestamps.push(now);

  // Trim old timestamps
  const oneMinuteAgo = now - 60_000;
  while (tradeTimestamps.length > 0 && tradeTimestamps[0]! < oneMinuteAgo) {
    tradeTimestamps.shift();
  }

  const pairKey = `${buyExchange}-${sellExchange}-${pair}`;
  lastTradeByPair.set(pairKey, now);
}

/**
 * Get current risk metrics for display.
 */
export function getRiskMetrics() {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const recentTrades = tradeTimestamps.filter((t) => t > oneMinuteAgo);

  return {
    circuitBreaker: circuitBreaker.getState(),
    tradesLastMinute: recentTrades.length,
    maxTradesPerMinute: MAX_TRADES_PER_MINUTE,
    minVolumeBTC: MIN_VOLUME_BTC.toString(),
    maxExposurePercent: MAX_EXPOSURE_PERCENT.toString(),
  };
}
