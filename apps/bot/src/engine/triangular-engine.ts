import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type { ArbitrageOpportunity, TradingPair } from '@arbitrage/shared';
import { FEE_CONFIG, MIN_DETECTION_THRESHOLD } from '@arbitrage/shared';
import { orderBookStore } from '../lib/store.js';
import { eventBus } from '../lib/event-bus.js';
import { logger } from '../lib/logger.js';

/**
 * Triangular Arbitrage Engine.
 *
 * Detects profit opportunities in 3-leg cycles within a SINGLE exchange:
 *   Route A: USDT → BTC → ETH → USDT
 *   Route B: USDT → ETH → BTC → USDT
 *
 * Uses Binance data (highest liquidity, all 3 pairs available).
 * Scans on every ETH/BTC or ETH/USDT orderbook update.
 */
export class TriangularArbitrageEngine {
  private opportunityCount = 0;
  private scanCount = 0;
  private exchange = 'binance' as const;

  start(): void {
    eventBus.on('orderbook', (book) => {
      // Only scan triangular when we get ETH pair data (less frequent than BTC/USDT)
      if (book.exchange === this.exchange && (book.pair === 'ETH/USDT' || book.pair === 'ETH/BTC')) {
        this.scan();
      }
    });
    logger.info('🔺 Triangular arbitrage engine started (USDT→BTC→ETH→USDT on Binance)');
  }

  getStats() {
    return {
      triangularOpportunities: this.opportunityCount,
      triangularScans: this.scanCount,
    };
  }

  private scan(): void {
    this.scanCount++;

    // Get all 3 books from Binance
    const btcUsdt = orderBookStore.get(this.exchange, 'BTC/USDT');
    const ethUsdt = orderBookStore.get(this.exchange, 'ETH/USDT');
    const ethBtc = orderBookStore.get(this.exchange, 'ETH/BTC');

    if (!btcUsdt || !ethUsdt || !ethBtc) return;

    // Check freshness
    const now = Date.now();
    if (now - btcUsdt.localTimestamp > 3000) return;
    if (now - ethUsdt.localTimestamp > 3000) return;
    if (now - ethBtc.localTimestamp > 3000) return;

    const fee = FEE_CONFIG[this.exchange].takerFee;

    // Route A: USDT → BTC → ETH → USDT
    // Leg 1: Buy BTC with USDT → use BTC/USDT asks[0]
    // Leg 2: Buy ETH with BTC → use ETH/BTC asks[0] (paying ask price in BTC per ETH)
    // Leg 3: Sell ETH for USDT → use ETH/USDT bids[0]
    this.checkRoute(
      'USDT→BTC→ETH→USDT',
      btcUsdt.asks[0], // Buy BTC with USDT
      ethBtc.asks[0],  // Buy ETH with BTC (pay the ask)
      ethUsdt.bids[0], // Sell ETH for USDT
      fee,
    );

    // Route B: USDT → ETH → BTC → USDT
    // Leg 1: Buy ETH with USDT → use ETH/USDT asks[0]
    // Leg 2: Sell ETH for BTC → use ETH/BTC bids[0] (receiving bid price in BTC per ETH)
    // Leg 3: Sell BTC for USDT → use BTC/USDT bids[0]
    this.checkRoute(
      'USDT→ETH→BTC→USDT',
      ethUsdt.asks[0], // Buy ETH with USDT
      ethBtc.bids[0],  // Sell ETH for BTC (receive the bid)
      btcUsdt.bids[0], // Sell BTC for USDT
      fee,
    );
  }

  /**
   * Route A: USDT → BTC → ETH → USDT
   * 1. Buy BTC with USDT at btcAsk
   * 2. Buy ETH with BTC at ethBtcAsk (spending BTC to get ETH)
   * 3. Sell ETH for USDT at ethUsdtBid
   *
   * Start: 1000 USDT
   * Step 1: 1000 / btcAsk = X BTC (- fee)
   * Step 2: X BTC / ethBtcAsk = Y ETH (- fee)
   * Step 3: Y ETH * ethUsdtBid = Z USDT (- fee)
   * Profit = Z - 1000
   */
  private checkRoute(
    routeName: string,
    leg1: { price: Decimal; quantity: Decimal } | undefined,
    leg2: { price: Decimal; quantity: Decimal } | undefined,
    leg3: { price: Decimal; quantity: Decimal } | undefined,
    fee: Decimal,
  ): void {
    if (!leg1 || !leg2 || !leg3) return;

    const startUsdt = new Decimal('1000'); // Start with 1000 USDT
    const feeMultiplier = new Decimal(1).minus(fee); // 0.999

    let result: Decimal;

    if (routeName === 'USDT→BTC→ETH→USDT') {
      // Step 1: Buy BTC with USDT
      const btcObtained = startUsdt.div(leg1.price).mul(feeMultiplier);
      // Step 2: Buy ETH with BTC (ETH/BTC ask = cost in BTC per ETH)
      const ethObtained = btcObtained.div(leg2.price).mul(feeMultiplier);
      // Step 3: Sell ETH for USDT
      result = ethObtained.mul(leg3.price).mul(feeMultiplier);
    } else {
      // USDT→ETH→BTC→USDT
      // Step 1: Buy ETH with USDT
      const ethObtained = startUsdt.div(leg1.price).mul(feeMultiplier);
      // Step 2: Sell ETH for BTC (ETH/BTC bid = revenue in BTC per ETH)
      const btcObtained = ethObtained.mul(leg2.price).mul(feeMultiplier);
      // Step 3: Sell BTC for USDT
      result = btcObtained.mul(leg3.price).mul(feeMultiplier);
    }

    const profit = result.minus(startUsdt);
    const profitPercent = profit.div(startUsdt).mul(100);

    // Only emit if there's a meaningful spread (even if negative after fees)
    if (profit.abs().gt(MIN_DETECTION_THRESHOLD)) {
      const opportunity: ArbitrageOpportunity = {
        id: randomUUID(),
        type: 'triangular',
        pair: 'BTC/USDT', // Primary pair reference
        buyExchange: this.exchange,
        sellExchange: this.exchange,
        buyPrice: leg1.price,
        sellPrice: leg3.price,
        grossSpread: profit,
        netProfit: profit,
        netProfitPercent: profitPercent,
        maxVolume: new Decimal('0.01'), // Fixed size for triangular
        estimatedSlippage: new Decimal(0),
        detectedAt: Date.now(),
        executed: profit.gt(0),
      };

      this.opportunityCount++;
      eventBus.emit('opportunity', opportunity);

      if (this.opportunityCount % 20 === 1) {
        logger.info(
          `🔺 Triangular #${this.opportunityCount}: ${routeName} | Result: $${result.toFixed(2)} from $1000 | Profit: $${profit.toFixed(4)} (${profitPercent.toFixed(4)}%)`,
        );
      }
    }
  }
}
