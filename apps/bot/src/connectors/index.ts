import type { ExchangeConnector, NormalizedOrderBook } from '@arbitrage/shared';
import { BinanceConnector } from './binance.js';
import { KrakenConnector } from './kraken.js';
import { OKXConnector } from './okx.js';
import { BybitConnector } from './bybit.js';
import { BitfinexConnector } from './bitfinex.js';
import { KuCoinConnector } from './kucoin.js';
import { BitstampConnector } from './bitstamp.js';
import { eventBus } from '../lib/event-bus.js';
import { orderBookStore } from '../lib/store.js';
import { logger } from '../lib/logger.js';

/**
 * Manages all exchange WebSocket connectors.
 * - Initializes all connectors
 * - Pipes orderbook events to the central event bus
 * - Updates the in-memory store
 * - Handles graceful connect/disconnect for all
 */
export class ConnectorManager {
  private connectors: ExchangeConnector[] = [];

  constructor() {
    this.connectors = [
      new BinanceConnector(),
      new KrakenConnector(),
      new OKXConnector(),
      new BybitConnector(),
      new BitfinexConnector(),
      new KuCoinConnector(),
      new BitstampConnector(),
    ];
  }

  async connectAll(): Promise<void> {
    logger.info(`📡 Connecting to ${this.connectors.length} exchanges...`);

    const results = await Promise.allSettled(
      this.connectors.map((connector) => {
        // Wire up event handling before connecting
        // Store always gets the latest data; eventBus is throttled to prevent CPU saturation
        const lastEmit = new Map<string, number>();
        const EMIT_INTERVAL = 200; // Max 5 events/sec per exchange:pair
        connector.on('orderbook', (book: NormalizedOrderBook) => {
          orderBookStore.update(book);
          const key = `${book.exchange}:${book.pair}`;
          const now = Date.now();
          const last = lastEmit.get(key) ?? 0;
          if (now - last >= EMIT_INTERVAL) {
            lastEmit.set(key, now);
            eventBus.emit('orderbook', book);
          }
        });

        connector.on('error', (error: Error) => {
          const enrichedError = Object.assign(error, { source: connector.name });
          eventBus.emit('error', enrichedError);
        });

        connector.on('reconnect', () => {
          logger.info(`🔄 [${connector.name}] Reconnected successfully`);
        });

        return connector.connect();
      }),
    );

    const connected = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info(`📡 Connected: ${connected}/${this.connectors.length} exchanges`);
    if (failed > 0) {
      logger.warn(`⚠️ Failed to connect: ${failed} exchanges (will retry via reconnection)`);
    }
  }

  async disconnectAll(): Promise<void> {
    logger.info('🔌 Disconnecting all exchanges...');
    await Promise.allSettled(this.connectors.map((c) => c.disconnect()));
    logger.info('🔌 All exchanges disconnected');
  }

  getConnectors(): ExchangeConnector[] {
    return this.connectors;
  }

  getStatus() {
    return this.connectors.map((c) => ({
      exchange: c.name,
      connected: c.isConnected,
      latencyMs: c.latencyMs,
    }));
  }
}
