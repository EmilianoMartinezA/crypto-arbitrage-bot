import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * Bitstamp WebSocket connector.
 * Subscribes to order_book_btcusdt channel for full order book updates.
 * Simple public WebSocket — no auth or token required.
 */
export class BitstampConnector extends BaseConnector {
  readonly name: ExchangeName = 'bitstamp';
  protected readonly wsUrl = 'wss://ws.bitstamp.net';
  protected readonly pair: TradingPair = 'BTC/USDT';

  protected subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        event: 'bts:subscribe',
        data: { channel: 'order_book_btcusdt' },
      }),
    );
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data) as BitstampMessage;

    // Ignore subscription confirmations and heartbeats
    if (msg.event === 'bts:subscription_succeeded') return;
    if (msg.event === 'bts:heartbeat') return;
    if (msg.event !== 'data') return;
    if (!msg.data) return;

    const book = msg.data;

    this.emitOrderBook({
      exchange: 'bitstamp',
      pair: 'BTC/USDT',
      asks: book.asks.slice(0, 20).map(([price, qty]) => this.toPriceLevel(price, qty)),
      bids: book.bids.slice(0, 20).map(([price, qty]) => this.toPriceLevel(price, qty)),
      localTimestamp: Date.now(),
      exchangeTimestamp: Number(book.microtimestamp) / 1000,
    });
  }
}

// ─── Bitstamp-specific types ─────────────────────────────────────────────────

interface BitstampOrderBookData {
  bids: [string, string][]; // [price, amount]
  asks: [string, string][];
  timestamp: string;
  microtimestamp: string;
}

interface BitstampMessage {
  event: string;
  channel?: string;
  data?: BitstampOrderBookData;
}
