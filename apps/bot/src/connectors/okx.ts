import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * OKX WebSocket connector.
 * Subscribes to books5 channel for BTC-USDT (top 5 levels, ~100ms updates).
 */
export class OKXConnector extends BaseConnector {
  readonly name: ExchangeName = 'okx';
  protected readonly wsUrl = 'wss://ws.okx.com:8443/ws/v5/public';
  protected readonly pair: TradingPair = 'BTC/USDT';

  protected subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        op: 'subscribe',
        args: [
          { channel: 'books5', instId: 'BTC-USDT' },
          { channel: 'books5', instId: 'ETH-USDT' },
        ],
      }),
    );
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data) as OKXMessage;

    if ('event' in msg) return;
    if (!msg.data || !Array.isArray(msg.data) || msg.data.length === 0) return;
    if (!msg.arg) return;

    const book = msg.data[0];
    if (!book) return;

    const instId = msg.arg.instId;
    const pair: TradingPair = instId === 'ETH-USDT' ? 'ETH/USDT' : 'BTC/USDT';

    this.emitOrderBook({
      exchange: 'okx',
      pair,
      asks: book.asks.map(([price, qty]) => this.toPriceLevel(price, qty)),
      bids: book.bids.map(([price, qty]) => this.toPriceLevel(price, qty)),
      localTimestamp: Date.now(),
      exchangeTimestamp: Number(book.ts),
    });
  }

  /** OKX sends ping as text "ping", reply with "pong" */
  protected override handlePing(): void {
    this.ws?.send('pong');
  }
}

// ─── OKX-specific types ──────────────────────────────────────────────────────

interface OKXBookData {
  asks: [string, string, string, string][]; // [price, qty, _, numOrders]
  bids: [string, string, string, string][];
  ts: string;
}

interface OKXMessage {
  event?: string;
  arg?: { channel: string; instId: string };
  data?: OKXBookData[];
}
