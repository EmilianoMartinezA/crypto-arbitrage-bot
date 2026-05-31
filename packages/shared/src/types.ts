import Decimal from 'decimal.js';

// ─── Exchange Identity ───────────────────────────────────────────────────────

export type ExchangeName =
  | 'binance'
  | 'kraken'
  | 'okx'
  | 'bybit'
  | 'bitfinex'
  | 'kucoin'
  | 'gateio'
  | 'bitstamp'
  | 'gemini';

export type TradingPair = 'BTC/USDT' | 'ETH/USDT' | 'ETH/BTC';

// ─── Order Book ──────────────────────────────────────────────────────────────

export interface PriceLevel {
  /** Price at this level */
  price: Decimal;
  /** Quantity available */
  quantity: Decimal;
}

export interface NormalizedOrderBook {
  exchange: ExchangeName;
  pair: TradingPair;
  /** Best ask (lowest sell) to worst */
  asks: PriceLevel[];
  /** Best bid (highest buy) to worst */
  bids: PriceLevel[];
  /** Timestamp when this data was received locally (ms) */
  localTimestamp: number;
  /** Timestamp from the exchange (ms), if available */
  exchangeTimestamp?: number;
  /** Sequence number for ordering */
  sequence?: number;
}

// ─── Fees ────────────────────────────────────────────────────────────────────

export interface ExchangeFees {
  exchange: ExchangeName;
  /** Maker fee as decimal (0.001 = 0.1%) */
  makerFee: Decimal;
  /** Taker fee as decimal (0.001 = 0.1%) */
  takerFee: Decimal;
  /** BTC withdrawal fee in BTC */
  withdrawalFeeBTC: Decimal;
}

// ─── Arbitrage ───────────────────────────────────────────────────────────────

export interface ArbitrageOpportunity {
  id: string;
  type: 'simple' | 'triangular' | 'statistical';
  pair: TradingPair;
  /** Exchange to buy from */
  buyExchange: ExchangeName;
  /** Exchange to sell on */
  sellExchange: ExchangeName;
  /** Best ask price on buy exchange */
  buyPrice: Decimal;
  /** Best bid price on sell exchange */
  sellPrice: Decimal;
  /** Spread before fees */
  grossSpread: Decimal;
  /** Spread after all fees and estimated slippage */
  netProfit: Decimal;
  /** Net profit as percentage */
  netProfitPercent: Decimal;
  /** Maximum executable volume (limited by order book depth) */
  maxVolume: Decimal;
  /** Estimated slippage based on depth */
  estimatedSlippage: Decimal;
  /** Timestamp of detection */
  detectedAt: number;
  /** Whether this opportunity was executed */
  executed: boolean;
}

// ─── Trade Execution ─────────────────────────────────────────────────────────

export type TradeStatus = 'pending' | 'partial' | 'filled' | 'cancelled' | 'failed';
export type TradeSide = 'buy' | 'sell';

export interface SimulatedTrade {
  id: string;
  opportunityId: string;
  exchange: ExchangeName;
  pair: TradingPair;
  side: TradeSide;
  /** Requested quantity */
  requestedQuantity: Decimal;
  /** Actually filled quantity (respecting book depth) */
  filledQuantity: Decimal;
  /** Average fill price (weighted by depth levels) */
  averagePrice: Decimal;
  /** Total cost/revenue including fees */
  totalCost: Decimal;
  /** Fee paid */
  feePaid: Decimal;
  status: TradeStatus;
  /** Execution timestamp */
  executedAt: number;
  /** Latency from detection to execution (ms) */
  latencyMs: number;
}

// ─── Wallet / Balance ────────────────────────────────────────────────────────

export interface WalletBalance {
  exchange: ExchangeName;
  /** Available BTC balance */
  btc: Decimal;
  /** Available USDT balance */
  usdt: Decimal;
  /** Last updated */
  updatedAt: number;
}

// ─── Risk Management ─────────────────────────────────────────────────────────

export interface CircuitBreakerState {
  /** Whether the circuit breaker is tripped */
  isTripped: boolean;
  /** Reason for tripping */
  reason?: string;
  /** When it was tripped */
  trippedAt?: number;
  /** When it will reset (auto-reset) */
  resetsAt?: number;
}

// ─── Exchange Connector Interface ────────────────────────────────────────────

export type OrderBookHandler = (book: NormalizedOrderBook) => void;
export type ErrorHandler = (error: Error) => void;
export type ReconnectHandler = () => void;

export interface ExchangeConnector {
  readonly name: ExchangeName;
  readonly isConnected: boolean;
  readonly latencyMs: number;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(event: 'orderbook', handler: OrderBookHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'reconnect', handler: ReconnectHandler): void;
  off(event: 'orderbook', handler: OrderBookHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(event: 'reconnect', handler: ReconnectHandler): void;
}

// ─── Bot Status (for dashboard) ──────────────────────────────────────────────

export interface ExchangeStatus {
  exchange: ExchangeName;
  connected: boolean;
  latencyMs: number;
  lastUpdate: number;
  bookAge: number;
}

export interface BotStatus {
  isRunning: boolean;
  uptime: number;
  exchanges: ExchangeStatus[];
  circuitBreaker: CircuitBreakerState;
  totalOpportunities: number;
  totalTrades: number;
  totalProfitUSD: Decimal;
}

// ─── SSE Events (bot → frontend) ────────────────────────────────────────────

export type SSEEventType =
  | 'orderbook'
  | 'opportunity'
  | 'trade'
  | 'status'
  | 'pnl'
  | 'error';

export interface SSEMessage<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: number;
}
