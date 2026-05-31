import Decimal from 'decimal.js';
import type { ExchangeName, NormalizedOrderBook, TradingPair, PriceLevel } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * Kraken WebSocket connector (v1 API).
 * Subscribes to book channel with depth 10 for XBT/USDT.
 * Maintains local book state and applies incremental updates.
 */
export class KrakenConnector extends BaseConnector {
  readonly name: ExchangeName = 'kraken';
  protected readonly wsUrl = 'wss://ws.kraken.com';
  protected readonly pair: TradingPair = 'BTC/USDT';

  // Local book state — accumulates incremental updates
  private localAsks = new Map<string, PriceLevel>(); // price string → level
  private localBids = new Map<string, PriceLevel>();

  protected subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        event: 'subscribe',
        pair: ['XBT/USDT'],
        subscription: { name: 'book', depth: 10 },
      }),
    );
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data);

    // Kraken sends system/subscription status as objects
    if (!Array.isArray(msg)) return;

    const payload = msg[1] as KrakenBookPayload;
    if (!payload) return;

    // Snapshot: replace entire local book
    if ('as' in payload && 'bs' in payload) {
      this.localAsks.clear();
      this.localBids.clear();

      for (const [price, qty] of payload.as) {
        this.localAsks.set(price, this.toPriceLevel(price, qty));
      }
      for (const [price, qty] of payload.bs) {
        this.localBids.set(price, this.toPriceLevel(price, qty));
      }
    } else {
      // Incremental update: apply deltas to local book
      if ('a' in payload && payload.a) {
        for (const [price, qty] of payload.a) {
          if (new Decimal(qty).isZero()) {
            this.localAsks.delete(price);
          } else {
            this.localAsks.set(price, this.toPriceLevel(price, qty));
          }
        }
      }
      if ('b' in payload && payload.b) {
        for (const [price, qty] of payload.b) {
          if (new Decimal(qty).isZero()) {
            this.localBids.delete(price);
          } else {
            this.localBids.set(price, this.toPriceLevel(price, qty));
          }
        }
      }
    }

    // Emit full accumulated book (sorted)
    const asks = [...this.localAsks.values()].sort((a, b) => a.price.cmp(b.price));
    const bids = [...this.localBids.values()].sort((a, b) => b.price.cmp(a.price));

    if (asks.length > 0 || bids.length > 0) {
      this.emitOrderBook({
        exchange: 'kraken',
        pair: 'BTC/USDT',
        asks,
        bids,
        localTimestamp: Date.now(),
      });
    }
  }
}

// ─── Kraken-specific types ───────────────────────────────────────────────────

type KrakenPriceLevel = [string, string, string]; // [price, volume, timestamp]

interface KrakenBookSnapshot {
  as: KrakenPriceLevel[];
  bs: KrakenPriceLevel[];
}

interface KrakenBookUpdate {
  a?: KrakenPriceLevel[];
  b?: KrakenPriceLevel[];
}

type KrakenBookPayload = KrakenBookSnapshot | KrakenBookUpdate;
