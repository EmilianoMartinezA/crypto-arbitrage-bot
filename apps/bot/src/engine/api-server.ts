import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ArbitrageOpportunity, SimulatedTrade } from '@arbitrage/shared';
import { eventBus } from '../lib/event-bus.js';
import { getRecentTrades, getRecentOpportunities } from '../lib/repository.js';
import { orderBookStore } from '../lib/store.js';
import { logger } from '../lib/logger.js';
import { walletManager } from './wallet-manager.js';
import Decimal from 'decimal.js';

const PORT = Number(process.env['PORT'] ?? 4000);

// Keep recent data in memory for REST endpoints
const recentOpportunities: ArbitrageOpportunity[] = [];
const recentTrades: SimulatedTrade[] = [];
const MAX_HISTORY = 200;

// SSE clients
const sseClients = new Set<ServerResponse>();

/**
 * Lightweight HTTP server providing:
 * - GET /events       → SSE stream (real-time)
 * - GET /api/status   → Bot status + exchange connectivity
 * - GET /api/opportunities → Recent arbitrage opportunities
 * - GET /api/trades   → Recent executed trades
 * - GET /api/wallets  → Current wallet balances
 * - GET /api/pnl      → Portfolio P&L summary
 * - GET /health       → Health check
 */
export function startAPIServer(
  getEngineStats: () => { opportunityCount: number; scanCount: number },
  getSimulatorStats: () => { tradeCount: number; totalProfitUSD: Decimal },
  getConnectorStatus?: () => Array<{ exchange: string; connected: boolean; latencyMs: number }>,
): void {
  // Wire up event bus to SSE broadcast
  // Throttle opportunities to max 2/second to avoid flooding frontend
  let lastOppBroadcast = 0;
  const OPP_THROTTLE_MS = 500;

  eventBus.on('opportunity', (opp) => {
    recentOpportunities.unshift(opp);
    if (recentOpportunities.length > MAX_HISTORY) recentOpportunities.pop();

    // Always broadcast triangular and statistical (they're rare and important)
    // Only throttle simple opportunities (they flood at ~1000/s)
    if (opp.type === 'triangular' || opp.type === 'statistical') {
      broadcast('opportunity', serializeOpportunity(opp));
    } else {
      const now = Date.now();
      if (now - lastOppBroadcast >= OPP_THROTTLE_MS) {
        lastOppBroadcast = now;
        broadcast('opportunity', serializeOpportunity(opp));
      }
    }
  });

  eventBus.on('trade', (trade) => {
    recentTrades.unshift(trade);
    if (recentTrades.length > MAX_HISTORY) recentTrades.pop();
    broadcast('trade', serializeTrade(trade));
  });

  // Throttle: max 1 orderbook SSE per exchange per 500ms
  const lastSent = new Map<string, number>();
  const THROTTLE_MS = 500;

  eventBus.on('orderbook', (book) => {
    const now = Date.now();
    const throttleKey = `${book.exchange}:${book.pair}`;
    const last = lastSent.get(throttleKey) ?? 0;
    if (now - last < THROTTLE_MS) return;
    lastSent.set(throttleKey, now);

    // Only send if we have at least bid OR ask with valid price (>1000)
    const bestBid = book.bids[0];
    const bestAsk = book.asks[0];
    if (!bestBid && !bestAsk) return;
    if (bestBid && bestBid.price.lt(1000)) return;

    broadcast('orderbook', {
      exchange: book.exchange,
      pair: book.pair,
      bestBid: bestBid ? { price: bestBid.price.toString(), qty: bestBid.quantity.toString() } : null,
      bestAsk: bestAsk ? { price: bestAsk.price.toString(), qty: bestAsk.quantity.toString() } : null,
      depth: book.asks.length + book.bids.length,
      timestamp: book.localTimestamp,
    });
  });

  // Status broadcast every 5s
  setInterval(() => {
    const books = orderBookStore.getAll();
    const btcPrice = books.find((b) => b.exchange === 'binance')?.bids[0]?.price ?? new Decimal(0);
    const portfolio = walletManager.getTotalPortfolioValue(btcPrice);
    const engineStats = getEngineStats();
    const simStats = getSimulatorStats();

    broadcast('status', {
      uptime: process.uptime(),
      exchanges: books.map((b) => {
        const connStatus = getConnectorStatus?.()?.find((c) => c.exchange === b.exchange);
        return {
          exchange: b.exchange,
          pair: b.pair,
          connected: connStatus?.connected ?? (Date.now() - b.localTimestamp < 5000),
          bookAge: Date.now() - b.localTimestamp,
          bestBid: b.bids[0]?.price.toString() ?? null,
          bestAsk: b.asks[0]?.price.toString() ?? null,
        };
      }),
      engine: engineStats,
      trades: simStats.tradeCount,
      pnl: portfolio.pnlUSD.toString(),
      pnlPercent: portfolio.pnlPercent.toString(),
    });
  }, 5000);

  const server = createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url ?? '/';
    const [url, queryString] = rawUrl.split('?') as [string, string | undefined];
    const params = new URLSearchParams(queryString || '');

    if (url === '/events') return handleSSE(req, res);
    if (url === '/api/status') return handleStatus(res, getEngineStats, getSimulatorStats);
    if (url === '/api/opportunities') return handleJSON(res, recentOpportunities.slice(0, 50).map(serializeOpportunity));
    if (url === '/api/trades') return handleJSON(res, recentTrades.slice(0, 50).map(serializeTrade));
    if (url === '/api/wallets') return handleJSON(res, walletManager.getAllBalances().map(serializeWallet));
    if (url === '/api/pnl') return handlePnL(res);
    if (url === '/health') return handleJSON(res, { status: 'ok', uptime: process.uptime() });
    if (url === '/api/history/trades') return handleJSON(res, getRecentTrades(Number(params.get('limit')) || 20));
    if (url === '/api/history/opportunities') return handleJSON(res, getRecentOpportunities(Number(params.get('limit')) || 30));
    if (url === '/api/export/trades.csv') return handleCSVExport(res, 'trades');
    if (url === '/api/export/opportunities.csv') return handleCSVExport(res, 'opportunities');

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, () => {
    logger.info(`🌐 API server listening on port ${PORT}`);
    logger.info(`   SSE: http://localhost:${PORT}/events`);
    logger.info(`   API: http://localhost:${PORT}/api/status`);
  });
}

// ─── SSE Handler ─────────────────────────────────────────────────────────────

function handleSSE(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  _req.on('close', () => {
    sseClients.delete(res);
  });
}

function broadcast(type: string, data: unknown): void {
  const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// ─── REST Handlers ───────────────────────────────────────────────────────────

function handleJSON(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleStatus(res: ServerResponse, getEngineStats: () => unknown, getSimulatorStats: () => unknown): void {
  const books = orderBookStore.getAll();
  handleJSON(res, {
    isRunning: true,
    uptime: process.uptime(),
    exchanges: books.map((b) => ({
      exchange: b.exchange,
      pair: b.pair,
      bookAge: Date.now() - b.localTimestamp,
      bidsCount: b.bids.length,
      asksCount: b.asks.length,
      bestBid: b.bids[0]?.price.toString() ?? null,
      bestAsk: b.asks[0]?.price.toString() ?? null,
    })),
    engine: getEngineStats(),
    simulator: getSimulatorStats(),
    sseClients: sseClients.size,
  });
}

function handlePnL(res: ServerResponse): void {
  const books = orderBookStore.getAll();
  const btcPrice = books.find((b) => b.exchange === 'binance')?.bids[0]?.price ?? new Decimal(0);
  const portfolio = walletManager.getTotalPortfolioValue(btcPrice);

  handleJSON(res, {
    totalBTC: portfolio.totalBTC.toString(),
    totalUSDT: portfolio.totalUSDT.toString(),
    totalValueUSD: portfolio.totalValueUSD.toString(),
    initialValueUSD: portfolio.initialValueUSD.toString(),
    pnlUSD: portfolio.pnlUSD.toString(),
    pnlPercent: portfolio.pnlPercent.toString(),
  });
}

// ─── CSV Export Handler ─────────────────────────────────────────────────────────────

function handleCSVExport(res: ServerResponse, type: 'trades' | 'opportunities'): void {
  const filename = `${type}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.writeHead(200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });

  if (type === 'trades') {
    const rows = getRecentTrades(1000);
    res.write('id,opportunity_id,exchange,pair,side,filled_quantity,average_price,total_cost,fee_paid,executed_at,latency_ms\n');
    for (const r of rows) {
      res.write(`${r.id},${r.opportunity_id},${r.exchange},${r.pair},${r.side},${r.filled_quantity},${r.average_price},${r.total_cost},${r.fee_paid},${new Date(r.executed_at).toISOString()},${r.latency_ms}\n`);
    }
  } else {
    const rows = getRecentOpportunities(1000);
    res.write('id,type,pair,buy_exchange,sell_exchange,buy_price,sell_price,gross_spread,net_profit,net_profit_percent,max_volume,detected_at,executed\n');
    for (const r of rows) {
      res.write(`${r.id},${r.type},${r.pair},${r.buy_exchange},${r.sell_exchange},${r.buy_price},${r.sell_price},${r.gross_spread},${r.net_profit},${r.net_profit_percent},${r.max_volume},${new Date(r.detected_at).toISOString()},${r.executed}\n`);
    }
  }

  res.end();
}

// ─── Serializers (Decimal → string for JSON) ─────────────────────────────────

function serializeOpportunity(opp: ArbitrageOpportunity) {
  return {
    ...opp,
    buyPrice: opp.buyPrice.toString(),
    sellPrice: opp.sellPrice.toString(),
    grossSpread: opp.grossSpread.toString(),
    netProfit: opp.netProfit.toString(),
    netProfitPercent: opp.netProfitPercent.toString(),
    maxVolume: opp.maxVolume.toString(),
    estimatedSlippage: opp.estimatedSlippage.toString(),
  };
}

function serializeTrade(trade: SimulatedTrade & { profit?: Decimal }) {
  return {
    ...trade,
    requestedQuantity: trade.requestedQuantity.toString(),
    filledQuantity: trade.filledQuantity.toString(),
    averagePrice: trade.averagePrice.toString(),
    totalCost: trade.totalCost.toString(),
    feePaid: trade.feePaid.toString(),
    profit: trade.profit?.toString() ?? '0',
  };
}

function serializeWallet(wallet: { exchange: string; btc: Decimal; usdt: Decimal; updatedAt: number }) {
  return {
    exchange: wallet.exchange,
    btc: wallet.btc.toString(),
    usdt: wallet.usdt.toString(),
    updatedAt: wallet.updatedAt,
  };
}
