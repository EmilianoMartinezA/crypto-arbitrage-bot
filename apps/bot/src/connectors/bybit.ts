import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * Bybit v5 WebSocket connector (spot).
 * Subscribes to orderbook.50.BTCUSDT for depth 50 updates.
 */
export class BybitConnector extends BaseConnector {
  readonly name: ExchangeName = 'bybit';
  protected readonly wsUrl = 'wss://stream.bybit.com/v5/public/spot';
  protected readonly pair: TradingPair = 'BTC/USDT';

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  protected subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        op: 'subscribe',
        args: ['orderbook.50.BTCUSDT'],
      }),
    );

    // Bybit requires periodic ping heartbeat
    this.pingTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 'ping' }));
    }, 20_000);
  }

  override async disconnect(): Promise<void> {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    return super.disconnect();
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data) as BybitMessage;

    // Ignore pong and subscription responses
    if (msg.op === 'pong' || msg.op === 'subscribe') return;
    if (!msg.data) return;

    const book = msg.data;

    this.emitOrderBook({
      exchange: 'bybit',
      pair: 'BTC/USDT',
      asks: book.a.map(([price, qty]) => this.toPriceLevel(price, qty)),
      bids: book.b.map(([price, qty]) => this.toPriceLevel(price, qty)),
      localTimestamp: Date.now(),
      exchangeTimestamp: msg.ts,
      sequence: book.u,
    });
  }
}

// ─── Bybit-specific types ────────────────────────────────────────────────────

interface BybitOrderBookData {
  s: string; // symbol
  a: [string, string][]; // asks [price, qty]
  b: [string, string][]; // bids [price, qty]
  u: number; // update ID
}

interface BybitMessage {
  topic?: string;
  type?: 'snapshot' | 'delta';
  op?: string;
  ts?: number;
  data?: BybitOrderBookData;
}
