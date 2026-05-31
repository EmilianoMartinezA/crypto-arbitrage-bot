import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type { ArbitrageOpportunity, ExchangeName, TradingPair } from '@arbitrage/shared';
import { orderBookStore } from '../lib/store.js';
import { eventBus } from '../lib/event-bus.js';
import { logger } from '../lib/logger.js';

/**
 * Statistical Arbitrage Engine — Mean-Reversion Strategy.
 *
 * Tracks the spread between each exchange pair over a rolling window.
 * When the spread deviates > 2σ from its historical mean, emits a signal
 * expecting the spread to revert to the mean.
 *
 * This is fundamentally different from simple arbitrage:
 * - Simple arb: "I can profit RIGHT NOW by buying low and selling high"
 * - Stat arb: "The spread is abnormally wide/narrow, it will likely revert"
 *
 * Emits opportunities with type 'simple' but includes stat-arb metadata.
 */

interface SpreadHistory {
  values: number[];
  timestamps: number[];
  mean: number;
  stdDev: number;
}

const WINDOW_SIZE = 120; // Keep last 120 data points (~60s at 2/s)
const Z_SCORE_THRESHOLD = 1.5; // Signal when spread > 1.5 standard deviations
const MIN_SAMPLES = 15; // Need at least 15 samples before generating signals
const SCAN_INTERVAL_MS = 1000; // Scan every 1s (not on every tick)

export class StatisticalArbEngine {
  private spreadHistory = new Map<string, SpreadHistory>();
  private signalCount = 0;
  private scanCount = 0;
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  private exchanges: ExchangeName[] = ['binance', 'okx', 'bybit', 'bitstamp', 'kraken', 'kucoin', 'bitfinex'];
  private pair: TradingPair = 'BTC/USDT';

  start(): void {
    // Collect spread data on every orderbook update
    eventBus.on('orderbook', (book) => {
      if (book.pair === this.pair) {
        this.collectSpreadData();
      }
    });

    // Run signal detection every 1s (not on every tick to avoid flooding)
    this.scanTimer = setInterval(() => {
      this.detectSignals();
    }, SCAN_INTERVAL_MS);

    logger.info('📐 Statistical arb engine started (mean-reversion, z-score > 2σ)');
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  getStats() {
    return {
      statArbSignals: this.signalCount,
      statArbScans: this.scanCount,
      trackedPairs: this.spreadHistory.size,
    };
  }

  /**
   * Collect current spread between all exchange pairs and store in history.
   */
  private collectSpreadData(): void {
    for (let i = 0; i < this.exchanges.length; i++) {
      for (let j = i + 1; j < this.exchanges.length; j++) {
        const exA = this.exchanges[i]!;
        const exB = this.exchanges[j]!;

        const bookA = orderBookStore.get(exA, this.pair);
        const bookB = orderBookStore.get(exB, this.pair);

        if (!bookA || !bookB) continue;
        const bidA = bookA.bids[0];
        const askB = bookB.asks[0];
        const bidB = bookB.bids[0];
        const askA = bookA.asks[0];

        if (!bidA || !bidB || !askA || !askB) continue;

        // Spread = midprice(A) - midprice(B)
        const midA = bidA.price.plus(askA.price).div(2);
        const midB = bidB.price.plus(askB.price).div(2);
        const spread = midA.minus(midB).toNumber();

        const key = `${exA}:${exB}`;
        this.updateHistory(key, spread);
      }
    }
  }

  private updateHistory(key: string, spread: number): void {
    let history = this.spreadHistory.get(key);
    if (!history) {
      history = { values: [], timestamps: [], mean: 0, stdDev: 0 };
      this.spreadHistory.set(key, history);
    }

    const now = Date.now();
    history.values.push(spread);
    history.timestamps.push(now);

    // Trim to window
    while (history.values.length > WINDOW_SIZE) {
      history.values.shift();
      history.timestamps.shift();
    }

    // Recalculate stats
    if (history.values.length >= MIN_SAMPLES) {
      const n = history.values.length;
      const sum = history.values.reduce((a, b) => a + b, 0);
      history.mean = sum / n;

      const variance = history.values.reduce((acc, val) => acc + Math.pow(val - history.mean, 2), 0) / n;
      history.stdDev = Math.sqrt(variance);
    }
  }

  /**
   * Check all tracked pairs for z-score signals.
   */
  private detectSignals(): void {
    this.scanCount++;

    for (const [key, history] of this.spreadHistory.entries()) {
      if (history.values.length < MIN_SAMPLES || history.stdDev === 0) continue;

      const currentSpread = history.values[history.values.length - 1]!;
      const zScore = (currentSpread - history.mean) / history.stdDev;

      // Signal when z-score exceeds threshold
      if (Math.abs(zScore) >= Z_SCORE_THRESHOLD) {
        const [exA, exB] = key.split(':') as [ExchangeName, ExchangeName];

        // z > 2: spread is abnormally HIGH (A expensive vs B) → expect it to shrink
        // z < -2: spread is abnormally LOW (A cheap vs B) → expect it to widen
        const buyExchange = zScore > 0 ? exB : exA;
        const sellExchange = zScore > 0 ? exA : exB;

        const bookBuy = orderBookStore.get(buyExchange, this.pair);
        const bookSell = orderBookStore.get(sellExchange, this.pair);
        if (!bookBuy || !bookSell) continue;

        const bestAsk = bookBuy.asks[0];
        const bestBid = bookSell.bids[0];
        if (!bestAsk || !bestBid) continue;

        const grossSpread = new Decimal(Math.abs(currentSpread));
        const expectedReversion = new Decimal(Math.abs(currentSpread - history.mean));

        const opportunity: ArbitrageOpportunity = {
          id: randomUUID(),
          type: 'statistical',
          pair: this.pair,
          buyExchange,
          sellExchange,
          buyPrice: bestAsk.price,
          sellPrice: bestBid.price,
          grossSpread,
          netProfit: expectedReversion,
          netProfitPercent: expectedReversion.div(bestAsk.price).mul(100),
          maxVolume: new Decimal('0.01'),
          estimatedSlippage: new Decimal(0),
          detectedAt: Date.now(),
          executed: false, // Stat-arb signals are informational, not auto-executed
        };

        this.signalCount++;
        eventBus.emit('opportunity', opportunity);

        if (this.signalCount % 10 === 1) {
          logger.info(
            `📐 Stat-Arb #${this.signalCount}: ${buyExchange}→${sellExchange} | z=${zScore.toFixed(2)} | Spread: $${currentSpread.toFixed(2)} | Mean: $${history.mean.toFixed(2)} | σ: $${history.stdDev.toFixed(2)} | Expected reversion: $${expectedReversion.toFixed(2)}`,
          );
        }
      }
    }
  }
}
