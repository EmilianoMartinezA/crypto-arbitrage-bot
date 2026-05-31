import type { ExchangeName, NormalizedOrderBook, TradingPair } from '@arbitrage/shared';
import { BaseConnector } from './base-connector.js';
import { logger } from '../lib/logger.js';

/**
 * KuCoin WebSocket connector.
 * Requires a preliminary REST call to get a WS token and endpoint.
 * Then subscribes to /market/level2:BTC-USDT for order book updates.
 */
export class KuCoinConnector extends BaseConnector {
  readonly name: ExchangeName = 'kucoin';
  protected wsUrl = ''; // Set dynamically after token fetch
  protected readonly pair: TradingPair = 'BTC/USDT';

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connectId = 0;

  override async connect(): Promise<void> {
    // Step 1: Get WS token and endpoint via REST
    const tokenData = await this.fetchToken();
    if (!tokenData) {
      throw new Error('KuCoin: Failed to obtain WebSocket token');
    }
    this.wsUrl = `${tokenData.endpoint}?token=${tokenData.token}&connectId=${Date.now()}`;
    this.connectId = tokenData.pingInterval;

    // Step 2: Connect via base class
    return super.connect();
  }

  override async disconnect(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    return super.disconnect();
  }

  protected subscribe(): void {
    // Subscribe to level2 order book for BTC-USDT
    this.ws?.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: '/market/level2:BTC-USDT',
        privateChannel: false,
        response: true,
      }),
    );

    // KuCoin requires periodic ping to keep connection alive
    this.pingInterval = setInterval(() => {
      this.ws?.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
    }, this.connectId || 18_000);
  }

  // Local book state — accumulates incremental updates
  private localAsks = new Map<string, { price: string; qty: string }>();
  private localBids = new Map<string, { price: string; qty: string }>();

  protected handleMessage(data: string): void {
    const msg = JSON.parse(data) as KuCoinMessage;

    // Ignore ack, pong, welcome messages
    if (msg.type === 'pong' || msg.type === 'welcome' || msg.type === 'ack') return;

    if (msg.type === 'message' && msg.topic === '/market/level2:BTC-USDT' && msg.data) {
      const { asks, bids } = msg.data.changes;

      // Apply deltas to local book
      for (const [price, qty] of asks) {
        if (qty === '0' || parseFloat(qty) === 0) {
          this.localAsks.delete(price);
        } else {
          this.localAsks.set(price, { price, qty });
        }
      }
      for (const [price, qty] of bids) {
        if (qty === '0' || parseFloat(qty) === 0) {
          this.localBids.delete(price);
        } else {
          this.localBids.set(price, { price, qty });
        }
      }

      // Emit full accumulated book (sorted, top 20)
      const sortedAsks = [...this.localAsks.values()]
        .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
        .slice(0, 20)
        .map(({ price, qty }) => this.toPriceLevel(price, qty));
      const sortedBids = [...this.localBids.values()]
        .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
        .slice(0, 20)
        .map(({ price, qty }) => this.toPriceLevel(price, qty));

      if (sortedAsks.length > 0 || sortedBids.length > 0) {
        this.emitOrderBook({
          exchange: 'kucoin',
          pair: 'BTC/USDT',
          asks: sortedAsks,
          bids: sortedBids,
          localTimestamp: Date.now(),
          exchangeTimestamp: msg.data.time,
          sequence: msg.data.sequenceEnd,
        });
      }
    }
  }

  private async fetchToken(): Promise<{ endpoint: string; token: string; pingInterval: number } | null> {
    try {
      const res = await fetch('https://api.kucoin.com/api/v1/bullet-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json()) as KuCoinTokenResponse;

      if (json.code !== '200000' || !json.data) {
        logger.error(`❌ [kucoin] Token fetch failed: ${json.code}`);
        return null;
      }

      const server = json.data.instanceServers[0];
      if (!server) return null;

      return {
        endpoint: server.endpoint,
        token: json.data.token,
        pingInterval: server.pingInterval,
      };
    } catch (err) {
      logger.error(`❌ [kucoin] Token fetch error: ${(err as Error).message}`);
      return null;
    }
  }
}

// ─── KuCoin-specific types ───────────────────────────────────────────────────

interface KuCoinTokenResponse {
  code: string;
  data?: {
    token: string;
    instanceServers: Array<{
      endpoint: string;
      pingInterval: number;
      protocol: string;
    }>;
  };
}

interface KuCoinMessage {
  type: 'message' | 'pong' | 'welcome' | 'ack';
  topic?: string;
  data?: {
    changes: {
      asks: [string, string, string][]; // [price, size, sequence]
      bids: [string, string, string][];
    };
    time: number;
    sequenceEnd: number;
  };
}
