import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * Bitfinex WebSocket v2 connector.
 * Subscribes to book channel for tBTCUST (USDT pair).
 * Bitfinex uses a unique array-based message format.
 */
export class BitfinexConnector extends BaseConnector {
  readonly name: ExchangeName = 'bitfinex';
  protected readonly wsUrl = 'wss://api-pub.bitfinex.com/ws/2';
  protected readonly pair: TradingPair = 'BTC/USDT';

  private channelId: number | null = null;
  private asks: Map<number, [string, string]> = new Map(); // price → [price, qty]
  private bidMap: Map<number, [string, string]> = new Map();

  protected subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        event: 'subscribe',
        channel: 'book',
        symbol: 'tBTCUST',
        prec: 'P0',
        freq: 'F0',
        len: '25',
      }),
    );
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data);

    // Event messages (subscribe confirmation)
    if (msg.event) {
      if (msg.event === 'subscribed' && msg.channel === 'book') {
        this.channelId = msg.chanId as number;
      }
      return;
    }

    // Data messages: [channelId, data]
    if (!Array.isArray(msg) || msg[0] !== this.channelId) return;

    const payload = msg[1];

    // Heartbeat
    if (payload === 'hb') return;

    // Snapshot: array of [price, count, amount]
    if (Array.isArray(payload) && Array.isArray(payload[0])) {
      this.handleSnapshot(payload as BitfinexBookEntry[]);
    } else if (Array.isArray(payload)) {
      // Single update: [price, count, amount]
      this.handleUpdate(payload as BitfinexBookEntry);
    }
  }

  private handleSnapshot(entries: BitfinexBookEntry[]): void {
    this.asks.clear();
    this.bidMap.clear();

    for (const [price, count, amount] of entries) {
      if (count === 0) continue;
      const absQty = Math.abs(amount).toString();
      const priceStr = price.toString();

      if (amount > 0) {
        // Bid
        this.bidMap.set(price, [priceStr, absQty]);
      } else {
        // Ask
        this.asks.set(price, [priceStr, absQty]);
      }
    }

    this.emitBook();
  }

  private handleUpdate(entry: BitfinexBookEntry): void {
    const [price, count, amount] = entry;

    if (count === 0) {
      // Remove level
      if (amount > 0) {
        this.bidMap.delete(price);
      } else {
        this.asks.delete(price);
      }
    } else {
      const absQty = Math.abs(amount).toString();
      const priceStr = price.toString();

      if (amount > 0) {
        this.bidMap.set(price, [priceStr, absQty]);
      } else {
        this.asks.set(price, [priceStr, absQty]);
      }
    }

    this.emitBook();
  }

  private emitBook(): void {
    // Sort asks ascending, bids descending
    const sortedAsks = [...this.asks.values()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([p, q]) => this.toPriceLevel(p, q));

    const sortedBids = [...this.bidMap.values()]
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([p, q]) => this.toPriceLevel(p, q));

    this.emitOrderBook({
      exchange: 'bitfinex',
      pair: 'BTC/USDT',
      asks: sortedAsks,
      bids: sortedBids,
      localTimestamp: Date.now(),
    });
  }
}

// ─── Bitfinex-specific types ─────────────────────────────────────────────────

/** [price, count, amount] — amount>0 = bid, amount<0 = ask */
type BitfinexBookEntry = [number, number, number];
