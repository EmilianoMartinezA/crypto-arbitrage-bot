import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';

/**
 * Binance WebSocket connector.
 * Uses the bookTicker stream for fastest best bid/ask updates,
 * plus depth@100ms for full order book levels.
 */
export class BinanceConnector extends BaseConnector {
  readonly name: ExchangeName = 'binance';
  protected readonly wsUrl = 'wss://stream.binance.com:9443/stream?streams=btcusdt@bookTicker/btcusdt@depth20@100ms/ethusdt@bookTicker/ethbtc@bookTicker';
  protected readonly pair: TradingPair = 'BTC/USDT';

  private currentBook: NormalizedOrderBook = {
    exchange: 'binance',
    pair: 'BTC/USDT',
    asks: [],
    bids: [],
    localTimestamp: 0,
  };

  protected subscribe(): void {
    // Combined stream auto-subscribes via URL params — no subscribe message needed
  }

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data) as { stream?: string; data?: unknown };

    if (msg.stream && msg.data) {
      if (msg.stream === 'btcusdt@bookTicker') {
        this.emitBookTicker(msg.data as BinanceBookTicker, 'BTC/USDT');
      } else if (msg.stream === 'ethusdt@bookTicker') {
        this.emitBookTicker(msg.data as BinanceBookTicker, 'ETH/USDT');
      } else if (msg.stream === 'ethbtc@bookTicker') {
        this.emitBookTicker(msg.data as BinanceBookTicker, 'ETH/BTC');
      } else if (msg.stream.includes('@depth')) {
        this.handleDepth(msg.data as BinanceDepthUpdate);
      }
    }
  }

  private emitBookTicker(ticker: BinanceBookTicker, pair: TradingPair): void {
    const book: NormalizedOrderBook = {
      exchange: 'binance',
      pair,
      bids: [this.toPriceLevel(ticker.b, ticker.B)],
      asks: [this.toPriceLevel(ticker.a, ticker.A)],
      localTimestamp: Date.now(),
    };
    if (pair === 'BTC/USDT') this.currentBook = book;
    this.emitOrderBook(book);
  }

  private handleDepth(depth: BinanceDepthUpdate): void {
    // Full depth snapshot update
    this.currentBook = {
      exchange: 'binance',
      pair: 'BTC/USDT',
      bids: depth.bids.map(([price, qty]) => this.toPriceLevel(price, qty)),
      asks: depth.asks.map(([price, qty]) => this.toPriceLevel(price, qty)),
      localTimestamp: Date.now(),
      sequence: depth.lastUpdateId,
    };
    this.emitOrderBook(this.currentBook);
  }
}

// ─── Binance-specific message types ──────────────────────────────────────────

interface BinanceBookTicker {
  /** Best bid price */
  b: string;
  /** Best bid quantity */
  B: string;
  /** Best ask price */
  a: string;
  /** Best ask quantity */
  A: string;
  /** Update ID */
  u: number;
}

interface BinanceDepthUpdate {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}
