import Decimal from 'decimal.js';
import type { ExchangeName, NormalizedOrderBook, CircuitBreakerState } from '@arbitrage/shared';
import {
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_WINDOW_MS,
  CIRCUIT_BREAKER_COOLDOWN_MS,
  CIRCUIT_BREAKER_WARMUP_MS,
} from '@arbitrage/shared';
import { eventBus } from '../lib/event-bus.js';
import { logger } from '../lib/logger.js';

interface PriceSnapshot {
  price: Decimal;
  timestamp: number;
}

/**
 * Circuit Breaker — pauses arbitrage execution during extreme volatility.
 *
 * Monitors BTC price changes across a sliding window.
 * If price moves > THRESHOLD (3%) within WINDOW (10s), trips the breaker.
 * Auto-resets after COOLDOWN (30s).
 *
 * Also detects anomalous prices (too far from median) to catch bad data.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = { isTripped: false };
  private priceHistory: PriceSnapshot[] = [];
  private medianPrice: Decimal = new Decimal(0);
  private anomalyThreshold = new Decimal('0.05'); // 5% from median = anomaly

  get isTripped(): boolean {
    // Auto-reset check
    if (this.state.isTripped && this.state.resetsAt && Date.now() >= this.state.resetsAt) {
      this.reset();
    }
    return this.state.isTripped;
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  private startTime = Date.now();

  start(): void {
    this.startTime = Date.now();
    eventBus.on('orderbook', (book) => {
      this.onPriceUpdate(book);
    });
    logger.info(`\uD83D\uDEE1\uFE0F Circuit breaker active (warmup ${CIRCUIT_BREAKER_WARMUP_MS / 1000}s, threshold ${CIRCUIT_BREAKER_THRESHOLD.mul(100)}%)`);
  }

  /**
   * Check if a price is anomalous (likely bad data).
   * Returns true if the price should be REJECTED.
   */
  isPriceAnomalous(price: Decimal): boolean {
    if (this.medianPrice.isZero()) return false;
    const deviation = price.minus(this.medianPrice).abs().div(this.medianPrice);
    return deviation.gt(this.anomalyThreshold);
  }

  private onPriceUpdate(book: NormalizedOrderBook): void {
    // Warmup period: don't monitor during startup
    if (Date.now() - this.startTime < CIRCUIT_BREAKER_WARMUP_MS) return;

    const bestBid = book.bids[0];
    if (!bestBid) return;

    // Skip obviously bad prices (e.g. KuCoin incremental "1" or "0.1")
    if (bestBid.price.lt(1000)) return;

    const now = Date.now();
    const price = bestBid.price;

    // Update median price (simple moving average of last 100 prices)
    this.priceHistory.push({ price, timestamp: now });

    // Trim to window
    this.priceHistory = this.priceHistory.filter(
      (p) => now - p.timestamp < CIRCUIT_BREAKER_WINDOW_MS * 3,
    );

    // Calculate median from recent prices
    if (this.priceHistory.length >= 5) {
      const sorted = [...this.priceHistory].sort((a, b) => a.price.cmp(b.price));
      this.medianPrice = sorted[Math.floor(sorted.length / 2)]!.price;
    }

    // Check volatility within window
    const windowPrices = this.priceHistory.filter(
      (p) => now - p.timestamp < CIRCUIT_BREAKER_WINDOW_MS,
    );

    if (windowPrices.length < 3) return;

    const prices = windowPrices.map((p) => p.price);
    const maxPrice = Decimal.max(...prices);
    const minPrice = Decimal.min(...prices);

    if (minPrice.isZero()) return;

    const volatility = maxPrice.minus(minPrice).div(minPrice);

    if (volatility.gt(CIRCUIT_BREAKER_THRESHOLD) && !this.state.isTripped) {
      this.trip(`Volatility ${volatility.mul(100).toFixed(2)}% exceeds ${CIRCUIT_BREAKER_THRESHOLD.mul(100)}% threshold in ${CIRCUIT_BREAKER_WINDOW_MS / 1000}s window`);
    }
  }

  private trip(reason: string): void {
    this.state = {
      isTripped: true,
      reason,
      trippedAt: Date.now(),
      resetsAt: Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS,
    };

    eventBus.emit('circuit-breaker', { isTripped: true, reason });
    logger.warn(`🚨 CIRCUIT BREAKER TRIPPED: ${reason}`);
    logger.warn(`   Will auto-reset in ${CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`);
  }

  private reset(): void {
    const wasTripped = this.state.isTripped;
    this.state = { isTripped: false };

    if (wasTripped) {
      eventBus.emit('circuit-breaker', { isTripped: false });
      logger.info('✅ Circuit breaker reset — trading resumed');
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
