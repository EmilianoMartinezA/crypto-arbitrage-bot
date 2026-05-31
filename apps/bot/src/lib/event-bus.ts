import { EventEmitter } from 'node:events';
import type { ArbitrageOpportunity, NormalizedOrderBook, SimulatedTrade } from '@arbitrage/shared';
import type Decimal from 'decimal.js';


/**
 * Central event bus for the arbitrage bot.
 * Decouples producers (connectors) from consumers (engine, simulator, API).
 */
interface BotEvents {
  orderbook: [NormalizedOrderBook];
  opportunity: [ArbitrageOpportunity];
  trade: [SimulatedTrade & { profit?: Decimal }];
  'circuit-breaker': [{ isTripped: boolean; reason?: string }];
  error: [Error & { source?: string }];
}

class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof BotEvents>(event: K, ...args: BotEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof BotEvents>(event: K, listener: (...args: BotEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof BotEvents>(event: K, listener: (...args: BotEvents[K]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }
}

export const eventBus = new TypedEventEmitter();
eventBus.setMaxListeners(50);

// Prevent unhandled 'error' event from crashing the process
eventBus.on('error', () => {
  // Errors are logged in connectors; this handler prevents process crash
});
