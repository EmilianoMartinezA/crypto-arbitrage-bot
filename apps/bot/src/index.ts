import { logger } from './lib/logger.js';
import { ConnectorManager } from './connectors/index.js';
import { ArbitrageEngine } from './engine/arbitrage-engine.js';
import { TradeSimulator } from './engine/trade-simulator.js';
import { startAPIServer } from './engine/api-server.js';
import { orderBookStore } from './lib/store.js';
import { circuitBreaker } from './engine/circuit-breaker.js';
import { TriangularArbitrageEngine } from './engine/triangular-engine.js';
import { StatisticalArbEngine } from './engine/statistical-arb.js';
import { getDatabase, closeDatabase } from './lib/database.js';
import { insertOpportunity, purgeOldData } from './lib/repository.js';
import { eventBus } from './lib/event-bus.js';

const connectorManager = new ConnectorManager();
const arbitrageEngine = new ArbitrageEngine();
const tradeSimulator = new TradeSimulator();
const triangularEngine = new TriangularArbitrageEngine();
const statisticalArbEngine = new StatisticalArbEngine();

async function main(): Promise<void> {
  logger.info('🚀 Bitcoin Arbitrage Bot v1.0 starting...');
  logger.info('═══════════════════════════════════════════');

  // 1. Start API server (SSE + REST)
  startAPIServer(
    () => arbitrageEngine.getStats(),
    () => tradeSimulator.getStats(),
    () => connectorManager.getStatus(),
  );

  // 2. Start circuit breaker (monitors volatility)
  circuitBreaker.start();

  // 3. Start arbitrage engine (listens to orderbook events)
  arbitrageEngine.start();

  // 4. Start triangular arbitrage engine
  triangularEngine.start();

  // 5. Start statistical arbitrage engine (mean-reversion)
  statisticalArbEngine.start();

  // 6. Initialize database + persist opportunities BEFORE trade simulator
  getDatabase();
  purgeOldData(); // Keep DB lean for fast queries
  eventBus.on('opportunity', (opp) => {
    if (opp.executed) {
      insertOpportunity(opp);
    }
  });

  // 7. Start trade simulator (listens to opportunity events)
  tradeSimulator.start();

  // 8. Connect to all exchanges
  await connectorManager.connectAll();

  // Status report every 30s
  setInterval(() => {
    const status = connectorManager.getStatus();
    const connected = status.filter((s) => s.connected).length;
    const books = orderBookStore.getExchangeCount();
    const engineStats = arbitrageEngine.getStats();
    const simStats = tradeSimulator.getStats();

    logger.info(
      `📡 ${connected}/${status.length} exchanges | ${books} books | ${engineStats.scanCount} scans | ${engineStats.opportunityCount} opportunities | ${simStats.tradeCount} trades | P&L: $${simStats.totalProfitUSD.toFixed(2)}`,
    );
  }, 30_000);

  logger.info('═══════════════════════════════════════════');
  logger.info('✅ All systems running. Monitoring for arbitrage...');
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`🛑 ${signal} received, shutting down gracefully...`);
  await connectorManager.disconnectAll();
  const simStats = tradeSimulator.getStats();
  logger.info(`📊 Final P&L: $${simStats.totalProfitUSD.toFixed(4)} | Trades: ${simStats.tradeCount}`);
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ─────────────────────────────────────────────────────────────────

main().catch((err) => {
  logger.error(`💀 Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
