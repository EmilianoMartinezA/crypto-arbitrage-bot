import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type {
  ArbitrageOpportunity,
  SimulatedTrade,
  PriceLevel,
  TradeSide,
} from '@arbitrage/shared';
import { FEE_CONFIG } from '@arbitrage/shared';
import { orderBookStore } from '../lib/store.js';
import { eventBus } from '../lib/event-bus.js';
import { logger } from '../lib/logger.js';
import { walletManager } from './wallet-manager.js';
import { validateOpportunity, recordTradeExecution } from './risk-manager.js';
import { insertTrade } from '../lib/repository.js';

/**
 * Trade Simulator — executes simulated trades respecting order book depth.
 *
 * For each ArbitrageOpportunity:
 * 1. Risk validation (circuit breaker, stale data, exposure)
 * 2. Verifies wallet has sufficient balance
 * 3. Walks order book levels to calculate realistic avg fill price
 * 4. Deducts fees and updates wallet balances
 * 5. Emits trade events for SSE streaming to dashboard
 */
export class TradeSimulator {
  private tradeCount = 0;
  private totalProfitUSD = new Decimal(0);

  start(): void {
    eventBus.on('opportunity', (opportunity) => {
      // Only execute opportunities marked as executable by the engine
      if (opportunity.executed) {
        this.executeArbitrage(opportunity);
      }
    });
    logger.info('💹 Trade simulator started — executing profitable opportunities');
  }

  getStats() {
    return {
      tradeCount: this.tradeCount,
      totalProfitUSD: this.totalProfitUSD,
    };
  }

  private executeArbitrage(opportunity: ArbitrageOpportunity): void {
    // Risk validation BEFORE execution
    const validation = validateOpportunity(opportunity);
    if (!validation.valid) {
      return;
    }

    // Get fresh order books for verification
    const buyBook = orderBookStore.get(opportunity.buyExchange, opportunity.pair);
    const sellBook = orderBookStore.get(opportunity.sellExchange, opportunity.pair);

    if (!buyBook || !sellBook) return;

    // Verify opportunity still exists with fresh data
    const bestAsk = buyBook.asks[0];
    const bestBid = sellBook.bids[0];
    if (!bestAsk || !bestBid || bestAsk.price.gte(bestBid.price)) return;

    // Determine max volume we can execute
    const maxBuyVolume = walletManager.getMaxBuyVolume(opportunity.buyExchange, bestAsk.price);
    const maxSellVolume = walletManager.getMaxSellVolume(opportunity.sellExchange);
    const bookVolume = opportunity.maxVolume;

    const execVolume = Decimal.min(maxBuyVolume, maxSellVolume, bookVolume);
    if (execVolume.lte(new Decimal('0.0001'))) return; // Min 0.0001 BTC

    // Simulate BUY leg
    const buyResult = this.simulateFill(buyBook.asks, execVolume, 'buy', opportunity.buyExchange);
    if (!buyResult) return;

    // Simulate SELL leg
    const sellResult = this.simulateFill(sellBook.bids, execVolume, 'sell', opportunity.sellExchange);
    if (!sellResult) return;

    // Calculate actual profit (may be negative due to fees — this is realistic)
    const actualProfit = sellResult.netRevenue.minus(buyResult.netCost);

    // Update wallets
    walletManager.executeBuy(opportunity.buyExchange, buyResult.filledQty, buyResult.netCost);
    walletManager.executeSell(opportunity.sellExchange, sellResult.filledQty, sellResult.netRevenue);

    const latencyMs = Date.now() - opportunity.detectedAt;

    // Create trade records
    const buyTrade: SimulatedTrade = {
      id: randomUUID(),
      opportunityId: opportunity.id,
      exchange: opportunity.buyExchange,
      pair: opportunity.pair,
      side: 'buy',
      requestedQuantity: execVolume,
      filledQuantity: buyResult.filledQty,
      averagePrice: buyResult.avgPrice,
      totalCost: buyResult.netCost,
      feePaid: buyResult.feePaid,
      status: 'filled',
      executedAt: Date.now(),
      latencyMs,
    };

    const sellTrade: SimulatedTrade = {
      id: randomUUID(),
      opportunityId: opportunity.id,
      exchange: opportunity.sellExchange,
      pair: opportunity.pair,
      side: 'sell',
      requestedQuantity: execVolume,
      filledQuantity: sellResult.filledQty,
      averagePrice: sellResult.avgPrice,
      totalCost: sellResult.netRevenue,
      feePaid: sellResult.feePaid,
      status: 'filled',
      executedAt: Date.now(),
      latencyMs,
    };

    // Record execution for rate limiting
    recordTradeExecution(opportunity.buyExchange, opportunity.sellExchange, opportunity.pair);

    // Emit events — attach actualProfit to the sell trade for frontend display
    eventBus.emit('trade', { ...buyTrade, profit: new Decimal(0) });
    eventBus.emit('trade', { ...sellTrade, profit: actualProfit });

    // Persist to SQLite
    insertTrade(buyTrade);
    insertTrade(sellTrade);

    this.tradeCount += 2;
    this.totalProfitUSD = this.totalProfitUSD.plus(actualProfit);

    logger.info(
      `💰 Trade #${this.tradeCount / 2}: Buy ${opportunity.buyExchange} → Sell ${opportunity.sellExchange} | ${execVolume.toFixed(6)} BTC | Profit: $${actualProfit.toFixed(4)} | Latency: ${latencyMs}ms | Total P&L: $${this.totalProfitUSD.toFixed(2)}`,
    );
  }

  /**
   * Walk order book levels to simulate a realistic fill.
   * Returns avg fill price, total cost, fee paid, and filled quantity.
   */
  private simulateFill(
    levels: PriceLevel[],
    targetVolume: Decimal,
    side: TradeSide,
    exchange: string,
  ): { avgPrice: Decimal; netCost: Decimal; netRevenue: Decimal; feePaid: Decimal; filledQty: Decimal } | null {
    if (levels.length === 0) return null;

    let remaining = targetVolume;
    let totalCost = new Decimal(0);
    let filledQty = new Decimal(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;

      const fillQty = Decimal.min(remaining, level.quantity);
      totalCost = totalCost.plus(fillQty.mul(level.price));
      filledQty = filledQty.plus(fillQty);
      remaining = remaining.minus(fillQty);
    }

    if (filledQty.isZero()) return null;

    const avgPrice = totalCost.div(filledQty);
    const feeRate = FEE_CONFIG[exchange as keyof typeof FEE_CONFIG]?.takerFee ?? new Decimal('0.001');
    const feePaid = totalCost.mul(feeRate);

    if (side === 'buy') {
      return {
        avgPrice,
        netCost: totalCost.plus(feePaid),
        netRevenue: new Decimal(0),
        feePaid,
        filledQty,
      };
    } else {
      return {
        avgPrice,
        netCost: new Decimal(0),
        netRevenue: totalCost.minus(feePaid),
        feePaid,
        filledQty,
      };
    }
  }
}
