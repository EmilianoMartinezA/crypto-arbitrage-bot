import Decimal from 'decimal.js';
import type { ExchangeFees, ExchangeName } from './types.js';

/**
 * Pre-calculated fee matrix loaded at startup.
 * Fees are expressed as decimals: 0.001 = 0.1%
 */
export const FEE_CONFIG: Record<ExchangeName, ExchangeFees> = {
  binance: {
    exchange: 'binance',
    makerFee: new Decimal('0.001'),
    takerFee: new Decimal('0.001'),
    withdrawalFeeBTC: new Decimal('0.0005'),
  },
  kraken: {
    exchange: 'kraken',
    makerFee: new Decimal('0.0016'),
    takerFee: new Decimal('0.0026'),
    withdrawalFeeBTC: new Decimal('0.00015'),
  },
  okx: {
    exchange: 'okx',
    makerFee: new Decimal('0.0008'),
    takerFee: new Decimal('0.001'),
    withdrawalFeeBTC: new Decimal('0.0001'),
  },
  bybit: {
    exchange: 'bybit',
    makerFee: new Decimal('0.001'),
    takerFee: new Decimal('0.001'),
    withdrawalFeeBTC: new Decimal('0.0002'),
  },
  bitfinex: {
    exchange: 'bitfinex',
    makerFee: new Decimal('0.001'),
    takerFee: new Decimal('0.002'),
    withdrawalFeeBTC: new Decimal('0.0004'),
  },
  kucoin: {
    exchange: 'kucoin',
    makerFee: new Decimal('0.001'),
    takerFee: new Decimal('0.001'),
    withdrawalFeeBTC: new Decimal('0.0005'),
  },
  gateio: {
    exchange: 'gateio',
    makerFee: new Decimal('0.002'),
    takerFee: new Decimal('0.002'),
    withdrawalFeeBTC: new Decimal('0.001'),
  },
  bitstamp: {
    exchange: 'bitstamp',
    makerFee: new Decimal('0.003'),
    takerFee: new Decimal('0.003'),
    withdrawalFeeBTC: new Decimal('0.0005'),
  },
  gemini: {
    exchange: 'gemini',
    makerFee: new Decimal('0.002'),
    takerFee: new Decimal('0.004'),
    withdrawalFeeBTC: new Decimal('0.001'),
  },
};

/**
 * Minimum GROSS SPREAD (USD) to EXECUTE a trade.
 * With 5s cooldown per exchange pair, results in ~1-2 trades/min.
 * Low enough to show activity, high enough to filter noise.
 */
export const MIN_EXECUTION_THRESHOLD = new Decimal('5.00');

/** Minimum gross spread (USD) to LOG an opportunity (even if not executable) */
export const MIN_DETECTION_THRESHOLD = new Decimal('0.01');

/** Maximum order book age before considering data stale (ms) */
export const MAX_BOOK_AGE_MS = 3000;

/** Circuit breaker: max price change % in a window to trigger pause */
export const CIRCUIT_BREAKER_THRESHOLD = new Decimal('0.05'); // 5%

/** Circuit breaker: time window for volatility check (ms) */
export const CIRCUIT_BREAKER_WINDOW_MS = 15_000; // 15s

/** Circuit breaker: cooldown after tripping (ms) */
export const CIRCUIT_BREAKER_COOLDOWN_MS = 15_000; // 15s

/** Circuit breaker: warmup period after startup before monitoring (ms) */
export const CIRCUIT_BREAKER_WARMUP_MS = 10_000;

/** Initial simulated wallet balances per exchange */
export const INITIAL_WALLET: { btc: string; usdt: string } = {
  btc: '1.0',
  usdt: '100000',
};
