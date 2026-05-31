import WebSocket from 'ws';
import Decimal from 'decimal.js';
import type {
  ExchangeConnector,
  ExchangeName,
  NormalizedOrderBook,
  OrderBookHandler,
  ErrorHandler,
  ReconnectHandler,
  TradingPair,
  PriceLevel,
} from '@arbitrage/shared';
import { logger } from '../lib/logger.js';

export type ConnectorEvent = 'orderbook' | 'error' | 'reconnect';

/**
 * Abstract base class for all exchange WebSocket connectors.
 * Provides: connection management, exponential backoff reconnection,
 * ping/pong heartbeat, stale data detection, and latency tracking.
 */
export abstract class BaseConnector implements ExchangeConnector {
  abstract readonly name: ExchangeName;
  protected abstract readonly wsUrl: string;
  protected abstract readonly pair: TradingPair;

  protected ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private baseDelay = 1000; // 1s
  private maxDelay = 30000; // 30s
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private connectionStartTime = 0;
  private _latencyMs = 0;
  private _isConnected = false;
  private destroyed = false;

  // Event handlers
  private orderbookHandlers: OrderBookHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private reconnectHandlers: ReconnectHandler[] = [];

  get isConnected(): boolean {
    return this._isConnected;
  }

  get latencyMs(): number {
    return this._latencyMs;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.destroyed) return;
    this.connectionStartTime = Date.now();
    return this.createConnection();
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this._isConnected = false;
    logger.info(`🔌 [${this.name}] Disconnected`);
  }

  // ─── Event Registration ────────────────────────────────────────────────────

  on(event: 'orderbook', handler: OrderBookHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'reconnect', handler: ReconnectHandler): void;
  on(event: ConnectorEvent, handler: OrderBookHandler | ErrorHandler | ReconnectHandler): void {
    switch (event) {
      case 'orderbook':
        this.orderbookHandlers.push(handler as OrderBookHandler);
        break;
      case 'error':
        this.errorHandlers.push(handler as ErrorHandler);
        break;
      case 'reconnect':
        this.reconnectHandlers.push(handler as ReconnectHandler);
        break;
    }
  }

  off(event: 'orderbook', handler: OrderBookHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: 'reconnect', handler: ReconnectHandler): void;
  off(event: ConnectorEvent, handler: OrderBookHandler | ErrorHandler | ReconnectHandler): void {
    switch (event) {
      case 'orderbook':
        this.orderbookHandlers = this.orderbookHandlers.filter((h) => h !== handler);
        break;
      case 'error':
        this.errorHandlers = this.errorHandlers.filter((h) => h !== handler);
        break;
      case 'reconnect':
        this.reconnectHandlers = this.reconnectHandlers.filter((h) => h !== handler);
        break;
    }
  }

  // ─── Emit Helpers ──────────────────────────────────────────────────────────

  private lastEmitTime = 0;
  private readonly EMIT_THROTTLE_MS = 100; // Max 10 emits/sec per connector

  protected emitOrderBook(book: NormalizedOrderBook): void {
    const now = Date.now();
    if (now - this.lastEmitTime < this.EMIT_THROTTLE_MS) return;
    this.lastEmitTime = now;
    for (const handler of this.orderbookHandlers) {
      handler(book);
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  private emitReconnect(): void {
    for (const handler of this.reconnectHandlers) {
      handler();
    }
  }

  // ─── Abstract Methods (exchange-specific) ──────────────────────────────────

  /** Send subscription message after WS connection opens */
  protected abstract subscribe(): void;

  /** Parse incoming WS message and emit normalized orderbook */
  protected abstract handleMessage(data: string): void;

  /** Optional: handle ping/pong specific to exchange protocol */
  protected handlePing(_data: Buffer): void {
    this.ws?.pong();
  }

  // ─── Connection Management ─────────────────────────────────────────────────

  private createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this._isConnected = true;
          this._latencyMs = Date.now() - this.connectionStartTime;
          this.reconnectAttempts = 0;
          this.lastMessageTime = Date.now();
          logger.info(`✅ [${this.name}] Connected (${this._latencyMs}ms)`);
          this.subscribe();
          this.startHeartbeat();
          resolve();
        });

        this.ws.on('message', (raw: Buffer) => {
          this.lastMessageTime = Date.now();
          try {
            this.handleMessage(raw.toString());
          } catch (err) {
            logger.error(`❌ [${this.name}] Message parse error: ${(err as Error).message}`);
          }
        });

        this.ws.on('ping', (data: Buffer) => {
          this.handlePing(data);
          this.lastMessageTime = Date.now();
        });

        this.ws.on('pong', () => {
          this._latencyMs = Date.now() - this.connectionStartTime;
        });

        this.ws.on('close', (code, reason) => {
          this._isConnected = false;
          logger.warn(`⚠️ [${this.name}] Connection closed: ${code} ${reason.toString()}`);
          this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
          logger.error(`❌ [${this.name}] WebSocket error: ${err.message}`);
          this.emitError(err);
          if (!this._isConnected) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ─── Reconnection (exponential backoff) ────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`💀 [${this.name}] Max reconnection attempts reached (${this.maxReconnectAttempts})`);
      this.emitError(new Error(`Max reconnection attempts reached for ${this.name}`));
      return;
    }

    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.maxDelay,
    );

    this.reconnectAttempts++;
    logger.info(`🔄 [${this.name}] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        this.connectionStartTime = Date.now();
        await this.createConnection();
        this.emitReconnect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ─── Heartbeat / Stale Detection ──────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Ping to measure latency
      this.connectionStartTime = Date.now();
      this.ws.ping();

      // Stale detection: if no message in 10s, something is wrong
      const age = Date.now() - this.lastMessageTime;
      if (age > 10_000) {
        logger.warn(`⚠️ [${this.name}] No data for ${Math.round(age / 1000)}s, reconnecting...`);
        this.ws.terminate();
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  protected toDecimal(value: string | number): Decimal {
    return new Decimal(value);
  }

  protected toPriceLevel(price: string | number, quantity: string | number): PriceLevel {
    return {
      price: new Decimal(price),
      quantity: new Decimal(quantity),
    };
  }
}
