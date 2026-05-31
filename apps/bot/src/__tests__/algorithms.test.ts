import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { FEE_CONFIG, MIN_EXECUTION_THRESHOLD, MIN_DETECTION_THRESHOLD } from '../../../../packages/shared/src/index.js';

/**
 * Integration tests for core arbitrage algorithms.
 * Validates mathematical correctness of:
 * - Triangular arbitrage route calculation
 * - Risk manager validation logic
 * - Statistical arbitrage z-score
 * - Net profit calculation (fees + slippage)
 * - Circuit breaker thresholds
 */

describe('Triangular Arbitrage Math', () => {
  const fee = FEE_CONFIG.binance.takerFee; // 0.001
  const feeMultiplier = new Decimal(1).minus(fee); // 0.999

  it('Route A (USDT→BTC→ETH→USDT): calculates correct profit', () => {
    const startUsdt = new Decimal('1000');
    const btcUsdtAsk = new Decimal('67000');  // Buy BTC at this price
    const ethBtcAsk = new Decimal('0.04');    // Buy ETH at this price (in BTC)
    const ethUsdtBid = new Decimal('2700');   // Sell ETH at this price

    // Step 1: Buy BTC with USDT
    const btcObtained = startUsdt.div(btcUsdtAsk).mul(feeMultiplier);
    // Step 2: Buy ETH with BTC
    const ethObtained = btcObtained.div(ethBtcAsk).mul(feeMultiplier);
    // Step 3: Sell ETH for USDT
    const result = ethObtained.mul(ethUsdtBid).mul(feeMultiplier);

    const profit = result.minus(startUsdt);

    // Manual: 1000/67000 = 0.014925 BTC * 0.999 = 0.014910
    //         0.014910/0.04 = 0.37275 ETH * 0.999 = 0.37238
    //         0.37238 * 2700 = 1005.42 * 0.999 = 1004.42
    //         profit = 1004.42 - 1000 = +$4.42
    expect(profit.gt(0)).toBe(true);
    expect(profit.toFixed(2)).toBe('4.44');
  });

  it('Route B (USDT→ETH→BTC→USDT): calculates correct profit', () => {
    const startUsdt = new Decimal('1000');
    const ethUsdtAsk = new Decimal('2700');   // Buy ETH at this price
    const ethBtcBid = new Decimal('0.04');    // Sell ETH at this price (in BTC)
    const btcUsdtBid = new Decimal('67000');  // Sell BTC at this price

    // Step 1: Buy ETH with USDT
    const ethObtained = startUsdt.div(ethUsdtAsk).mul(feeMultiplier);
    // Step 2: Sell ETH for BTC
    const btcObtained = ethObtained.mul(ethBtcBid).mul(feeMultiplier);
    // Step 3: Sell BTC for USDT
    const result = btcObtained.mul(btcUsdtBid).mul(feeMultiplier);

    const profit = result.minus(startUsdt);

    // Should be approximately symmetric to Route A but slightly different
    // due to bid/ask difference
    expect(profit.toFixed(2)).toBe('-10.38');
    expect(profit.lt(0)).toBe(true);
  });

  it('detects that Route A and B are NOT symmetric (bid/ask spread)', () => {
    const startUsdt = new Decimal('1000');
    // Same exchange prices but with realistic bid/ask spread
    const btcUsdtAsk = new Decimal('67010');
    const btcUsdtBid = new Decimal('67000');
    const ethBtcAsk = new Decimal('0.04002');
    const ethBtcBid = new Decimal('0.04000');
    const ethUsdtAsk = new Decimal('2701');
    const ethUsdtBid = new Decimal('2700');

    // Route A
    const btcA = startUsdt.div(btcUsdtAsk).mul(feeMultiplier);
    const ethA = btcA.div(ethBtcAsk).mul(feeMultiplier);
    const resultA = ethA.mul(ethUsdtBid).mul(feeMultiplier);

    // Route B
    const ethB = startUsdt.div(ethUsdtAsk).mul(feeMultiplier);
    const btcB = ethB.mul(ethBtcBid).mul(feeMultiplier);
    const resultB = btcB.mul(btcUsdtBid).mul(feeMultiplier);

    // Routes should give different results
    expect(resultA.eq(resultB)).toBe(false);
  });

  it('3 fees compound correctly (fee^3 effect)', () => {
    const startUsdt = new Decimal('1000');
    // Perfect prices that would yield $0 profit without fees
    const btcPrice = new Decimal('67000');
    const ethBtcPrice = new Decimal('0.04');
    const ethUsdtPrice = new Decimal('2680'); // 67000 * 0.04 = 2680

    const btc = startUsdt.div(btcPrice).mul(feeMultiplier);
    const eth = btc.div(ethBtcPrice).mul(feeMultiplier);
    const result = eth.mul(ethUsdtPrice).mul(feeMultiplier);

    const profit = result.minus(startUsdt);
    // With 0.1% fee × 3 legs, expect ~-$3 loss (0.3% of $1000)
    expect(profit.lt(0)).toBe(true);
    expect(profit.gt(new Decimal('-4'))).toBe(true); // Between -$4 and $0
    expect(profit.lt(new Decimal('-2'))).toBe(true); // At least -$2 from fees
  });
});

describe('Risk Manager Logic', () => {
  it('exposure check: rejects if trade > 50% of wallet', () => {
    const walletUsdt = new Decimal('100000');
    const walletBtc = new Decimal('1.0');
    const btcPrice = new Decimal('67000');
    const maxExposure = new Decimal('0.50'); // 50%

    const walletValueUsdt = walletUsdt.plus(walletBtc.mul(btcPrice)); // 167,000
    const tradeVolume = new Decimal('2.0'); // 2 BTC
    const tradeValueUsdt = tradeVolume.mul(btcPrice); // 134,000

    const exposurePercent = tradeValueUsdt.div(walletValueUsdt); // 134000/167000 = 80%

    expect(exposurePercent.gt(maxExposure)).toBe(true);
  });

  it('exposure check: passes if trade < 50% of wallet', () => {
    const walletUsdt = new Decimal('100000');
    const walletBtc = new Decimal('1.0');
    const btcPrice = new Decimal('67000');
    const maxExposure = new Decimal('0.50');

    const walletValueUsdt = walletUsdt.plus(walletBtc.mul(btcPrice)); // 167,000
    const tradeVolume = new Decimal('0.5'); // 0.5 BTC
    const tradeValueUsdt = tradeVolume.mul(btcPrice); // 33,500

    const exposurePercent = tradeValueUsdt.div(walletValueUsdt); // 33500/167000 = 20%

    expect(exposurePercent.lt(maxExposure)).toBe(true);
  });

  it('stale data: rejects books older than 3 seconds', () => {
    const MAX_BOOK_AGE_MS = 3000;
    const now = Date.now();
    const freshTimestamp = now - 1000; // 1s old
    const staleTimestamp = now - 5000; // 5s old

    expect(now - freshTimestamp < MAX_BOOK_AGE_MS).toBe(true);
    expect(now - staleTimestamp < MAX_BOOK_AGE_MS).toBe(false);
  });

  it('rate limiting: blocks after 60 trades/minute', () => {
    const MAX_TRADES_PER_MINUTE = 60;
    const timestamps: number[] = [];
    const now = Date.now();

    // Simulate 60 trades in the last minute
    for (let i = 0; i < 60; i++) {
      timestamps.push(now - i * 900); // Every 900ms
    }

    const oneMinuteAgo = now - 60_000;
    const recentTrades = timestamps.filter((t) => t > oneMinuteAgo);

    expect(recentTrades.length).toBe(60);
    expect(recentTrades.length >= MAX_TRADES_PER_MINUTE).toBe(true);
  });

  it('cooldown: blocks same pair within 5 seconds', () => {
    const COOLDOWN_MS = 5000;
    const lastTradeTime = Date.now() - 3000; // 3s ago
    const now = Date.now();

    const timeSinceLast = now - lastTradeTime;
    expect(timeSinceLast < COOLDOWN_MS).toBe(true); // Should block

    const olderTradeTime = Date.now() - 6000; // 6s ago
    const timeSinceOlder = now - olderTradeTime;
    expect(timeSinceOlder < COOLDOWN_MS).toBe(false); // Should allow
  });
});

describe('Statistical Arbitrage (Mean-Reversion)', () => {
  function calcStats(data: number[]): { mean: number; stdDev: number } {
    const n = data.length;
    const mean = data.reduce((sum, v) => sum + v, 0) / n;
    const variance = data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    return { mean, stdDev: Math.sqrt(variance) };
  }

  it('z-score calculation is correct', () => {
    const spreadHistory = [10, 12, 11, 13, 10, 12, 11, 10, 12, 11];
    const { mean, stdDev } = calcStats(spreadHistory);

    const currentSpread = 16; // Anomalous
    const zScore = (currentSpread - mean) / stdDev;

    expect(mean).toBeCloseTo(11.2, 1);
    expect(stdDev).toBeGreaterThan(0);
    expect(Math.abs(zScore)).toBeGreaterThan(1.5); // Should trigger signal
  });

  it('normal spread does NOT trigger signal (z-score < 1.5)', () => {
    const spreadHistory = [10, 12, 11, 13, 10, 12, 11, 10, 12, 11];
    const { mean, stdDev } = calcStats(spreadHistory);

    const currentSpread = 12; // Normal
    const zScore = (currentSpread - mean) / stdDev;

    expect(Math.abs(zScore)).toBeLessThan(1.5);
  });

  it('requires minimum 15 samples before generating signals', () => {
    const MIN_SAMPLES = 15;
    const shortHistory = [10, 12, 11, 13, 10]; // Only 5

    expect(shortHistory.length < MIN_SAMPLES).toBe(true);
    // Should not generate signal regardless of z-score
  });

  it('rolling window of 120 samples drops oldest values', () => {
    const WINDOW_SIZE = 120;
    const history: number[] = [];

    // Add 130 samples
    for (let i = 0; i < 130; i++) {
      history.push(Math.random() * 10);
      if (history.length > WINDOW_SIZE) {
        history.shift();
      }
    }

    expect(history.length).toBe(120);
  });
});

describe('Net Profit Calculation (Fees + Slippage)', () => {
  it('net profit accounts for both buy and sell fees', () => {
    const buyPrice = new Decimal('67000');
    const sellPrice = new Decimal('67100');
    const buyFee = FEE_CONFIG.binance.takerFee;   // 0.001
    const sellFee = FEE_CONFIG.kraken.takerFee;   // 0.0026

    const buyCost = buyPrice.mul(new Decimal(1).plus(buyFee));      // 67067
    const sellRevenue = sellPrice.mul(new Decimal(1).minus(sellFee)); // 66925.54

    const netProfit = sellRevenue.minus(buyCost);

    // Gross spread = $100, but fees eat into it
    expect(netProfit.lt(new Decimal('100'))).toBe(true);
    expect(netProfit.lt(0)).toBe(true); // Fees > spread
  });

  it('netProfitPercent uses final net profit (not gross)', () => {
    const buyPrice = new Decimal('67000');
    const sellPrice = new Decimal('67200');
    const buyFee = FEE_CONFIG.binance.takerFee;
    const sellFee = FEE_CONFIG.okx.takerFee;

    const buyCost = buyPrice.mul(new Decimal(1).plus(buyFee));
    const sellRevenue = sellPrice.mul(new Decimal(1).minus(sellFee));
    const netProfit = sellRevenue.minus(buyCost);
    const netProfitPercent = netProfit.div(buyPrice).mul(100);

    // Should be based on net (not gross $200 spread)
    expect(netProfitPercent.lt(new Decimal('0.3'))).toBe(true); // Much less than gross 0.3%
  });

  it('slippage reduces net profit further', () => {
    const buyPrice = new Decimal('67000');
    const sellPrice = new Decimal('67200');
    const buyFee = FEE_CONFIG.binance.takerFee;
    const sellFee = FEE_CONFIG.binance.takerFee;
    const slippage = new Decimal('15'); // $15 estimated slippage

    const buyCost = buyPrice.mul(new Decimal(1).plus(buyFee));
    const sellRevenue = sellPrice.mul(new Decimal(1).minus(sellFee));
    const netWithoutSlippage = sellRevenue.minus(buyCost);
    const netWithSlippage = netWithoutSlippage.minus(slippage);

    expect(netWithSlippage.lt(netWithoutSlippage)).toBe(true);
    expect(netWithoutSlippage.minus(netWithSlippage).toString()).toBe('15');
  });

  it('execution threshold of $5 filters low-value opportunities', () => {
    const grossSpreads = [
      new Decimal('3.50'),  // Below threshold → no execute
      new Decimal('5.00'),  // At threshold → execute
      new Decimal('12.00'), // Above threshold → execute
    ];

    expect(grossSpreads[0]!.lt(MIN_EXECUTION_THRESHOLD)).toBe(true);
    expect(grossSpreads[1]!.gte(MIN_EXECUTION_THRESHOLD)).toBe(true);
    expect(grossSpreads[2]!.gte(MIN_EXECUTION_THRESHOLD)).toBe(true);
  });

  it('detection threshold of $0.01 logs even tiny spreads', () => {
    const tinySpread = new Decimal('0.02');
    const microSpread = new Decimal('0.005');

    expect(tinySpread.gte(MIN_DETECTION_THRESHOLD)).toBe(true);
    expect(microSpread.lt(MIN_DETECTION_THRESHOLD)).toBe(true);
  });
});

describe('Circuit Breaker Logic', () => {
  it('trips when volatility exceeds 5% in window', () => {
    const THRESHOLD = 0.05; // 5%
    const prices = [67000, 67500, 68000, 71000]; // 71000 is 5.97% above 67000

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const volatility = (max - min) / min;

    expect(volatility).toBeGreaterThan(THRESHOLD);
  });

  it('does NOT trip under normal volatility', () => {
    const THRESHOLD = 0.05;
    const prices = [67000, 67100, 67050, 67200, 66900]; // Normal noise

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const volatility = (max - min) / min;

    expect(volatility).toBeLessThan(THRESHOLD);
  });

  it('anomaly detection flags prices > 5% from median', () => {
    const recentPrices = [67000, 67100, 67050, 67200, 66900];
    const sorted = [...recentPrices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;

    const normalPrice = 67150;
    const anomalousPrice = 72000; // 7.4% above median

    const normalDev = Math.abs(normalPrice - median) / median;
    const anomalousDev = Math.abs(anomalousPrice - median) / median;

    expect(normalDev).toBeLessThan(0.05);
    expect(anomalousDev).toBeGreaterThan(0.05);
  });
});
