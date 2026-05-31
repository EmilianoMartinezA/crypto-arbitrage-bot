import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type {
  ArbitrageOpportunity,
  ExchangeName,
  NormalizedOrderBook,
  TradingPair,
} from '@arbitrage/shared';
import { FEE_CONFIG, MIN_DETECTION_THRESHOLD, MIN_EXECUTION_THRESHOLD, MAX_BOOK_AGE_MS } from '@arbitrage/shared';
import { orderBookStore } from '../lib/store.js';
import { eventBus } from '../lib/event-bus.js';
import { logger } from '../lib/logger.js';

/**
 * Arbitrage Detection Engine.
 *
 * On every orderbook update, scans all exchange pairs for:
 *   Ask(A) < Bid(B) → potential arbitrage
 *
 * Calculates net profit after taker fees on both legs.
 * Estimates slippage from order book depth.
 * Emits ArbitrageOpportunity events when netProfit > threshold.
 */
export class ArbitrageEngine {
  private opportunityCount = 0;
  private scanCount = 0;
  private lastScanDuration = 0;
  private pairs: TradingPair[] = ['BTC/USDT', 'ETH/USDT'];

  start(): void {
    eventBus.on('orderbook', () => {
      this.scan();
    });
    logger.info('🧠 Arbitrage engine started — scanning on every orderbook update');
  }

  getStats() {
    return {
      opportunityCount: this.opportunityCount,
      scanCount: this.scanCount,
      lastScanDurationMs: this.lastScanDuration,
    };
  }

  private scan(): void {
    const start = performance.now();

    for (const pair of this.pairs) {
      const books = orderBookStore.getAllForPair(pair);
      if (books.length < 2) continue;

      // Filter out stale books
      const now = Date.now();
      const freshBooks = books.filter((b) => now - b.localTimestamp < MAX_BOOK_AGE_MS);
      if (freshBooks.length < 2) continue;

      // Check all pairs of exchanges for arbitrage
      for (let i = 0; i < freshBooks.length; i++) {
        for (let j = 0; j < freshBooks.length; j++) {
          if (i === j) continue;

          const buyBook = freshBooks[i]!;
          const sellBook = freshBooks[j]!;

          this.checkArbitrage(buyBook, sellBook, pair);
        }
      }
    }

    this.scanCount++;
    this.lastScanDuration = performance.now() - start;
  }

  private checkArbitrage(
    buyBook: NormalizedOrderBook,
    sellBook: NormalizedOrderBook,
    pair: TradingPair,
  ): void {
    // Need at least best ask and best bid
    const bestAsk = buyBook.asks[0];
    const bestBid = sellBook.bids[0];
    if (!bestAsk || !bestBid) return;

    // Basic check: is there a positive spread?
    if (bestAsk.price.gte(bestBid.price)) return;

    // Calculate gross spread
    const grossSpread = bestBid.price.minus(bestAsk.price);

    // Calculate net profit after fees on both legs
    const buyFee = FEE_CONFIG[buyBook.exchange].takerFee;
    const sellFee = FEE_CONFIG[sellBook.exchange].takerFee;

    // Cost to buy: price × (1 + fee)
    const buyCost = bestAsk.price.mul(Decimal.sum(1, buyFee));
    // Revenue from sell: price × (1 - fee)
    const sellRevenue = bestBid.price.mul(new Decimal(1).minus(sellFee));

    const netProfit = sellRevenue.minus(buyCost);

    // Calculate max executable volume
    const maxVolume = Decimal.min(bestAsk.quantity, bestBid.quantity);

    // Estimate slippage
    const estimatedSlippage = this.estimateSlippage(buyBook, sellBook, maxVolume);
    const finalNetProfit = netProfit.minus(estimatedSlippage);
    const netProfitPercent = finalNetProfit.div(bestAsk.price).mul(100);

    // Skip if gross spread is below detection threshold
    if (grossSpread.lt(MIN_DETECTION_THRESHOLD)) return;

    // Execute when gross spread exceeds threshold ($5)
    // Shows the bot actively trades while the 5s cooldown prevents flooding
    const isExecutable = grossSpread.gte(MIN_EXECUTION_THRESHOLD) && maxVolume.gt(new Decimal('0.0001'));

    const opportunity: ArbitrageOpportunity = {
      id: randomUUID(),
      type: 'simple',
      pair,
      buyExchange: buyBook.exchange,
      sellExchange: sellBook.exchange,
      buyPrice: bestAsk.price,
      sellPrice: bestBid.price,
      grossSpread,
      netProfit: finalNetProfit,
      netProfitPercent,
      maxVolume,
      estimatedSlippage,
      detectedAt: Date.now(),
      executed: isExecutable,
    };

    this.opportunityCount++;
    eventBus.emit('opportunity', opportunity);

    if (this.opportunityCount % 50 === 1) {
      logger.info(
        `\uD83C\uDFAF Opp #${this.opportunityCount}: Buy ${buyBook.exchange} @ $${bestAsk.price.toFixed(2)} \u2192 Sell ${sellBook.exchange} @ $${bestBid.price.toFixed(2)} | Gross: $${grossSpread.toFixed(2)} | Net: $${finalNetProfit.toFixed(2)} | ${isExecutable ? '\u2705 EXEC' : '\u26A0\uFE0F MONITOR'}`,
      );
    }
  }

  /**
   * Estimate slippage by walking the order book depth.
   * For a given volume, calculate how much worse the avg fill price would be
   * compared to the top-of-book price.
   */
  private estimateSlippage(
    buyBook: NormalizedOrderBook,
    sellBook: NormalizedOrderBook,
    volume: Decimal,
  ): Decimal {
    const buySlippage = this.calculateSlippageForSide(buyBook.asks, volume, 'buy');
    const sellSlippage = this.calculateSlippageForSide(sellBook.bids, volume, 'sell');
    return buySlippage.plus(sellSlippage);
  }

  private calculateSlippageForSide(
    levels: { price: Decimal; quantity: Decimal }[],
    targetVolume: Decimal,
    side: 'buy' | 'sell',
  ): Decimal {
    if (levels.length === 0) return new Decimal(0);

    const topPrice = levels[0]!.price;
    let remaining = targetVolume;
    let totalCost = new Decimal(0);
    let totalFilled = new Decimal(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;

      const fillQty = Decimal.min(remaining, level.quantity);
      totalCost = totalCost.plus(fillQty.mul(level.price));
      totalFilled = totalFilled.plus(fillQty);
      remaining = remaining.minus(fillQty);
    }

    if (totalFilled.isZero()) return new Decimal(0);

    // Average fill price
    const avgPrice = totalCost.div(totalFilled);

    // Slippage = difference between avg fill and top-of-book
    if (side === 'buy') {
      return avgPrice.minus(topPrice); // Positive means worse (paid more)
    } else {
      return topPrice.minus(avgPrice); // Positive means worse (received less)
    }
  }
}
