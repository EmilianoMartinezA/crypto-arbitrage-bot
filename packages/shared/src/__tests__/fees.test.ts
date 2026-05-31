import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { FEE_CONFIG } from '../constants.js';

describe('Fee Configuration', () => {
  it('should have fees for all supported exchanges', () => {
    const expectedExchanges = [
      'binance', 'kraken', 'okx', 'bybit', 'bitfinex', 'kucoin', 'bitstamp',
    ];

    for (const exchange of expectedExchanges) {
      const fees = FEE_CONFIG[exchange as keyof typeof FEE_CONFIG];
      expect(fees).toBeDefined();
      expect(fees.makerFee).toBeInstanceOf(Decimal);
      expect(fees.takerFee).toBeInstanceOf(Decimal);
      expect(fees.withdrawalFeeBTC).toBeInstanceOf(Decimal);
    }
  });

  it('taker fees should be >= maker fees', () => {
    for (const [exchange, fees] of Object.entries(FEE_CONFIG)) {
      expect(
        fees.takerFee.gte(fees.makerFee),
        `${exchange}: taker (${fees.takerFee}) should be >= maker (${fees.makerFee})`,
      ).toBe(true);
    }
  });

  it('fees should be between 0 and 1% (0.01)', () => {
    for (const [exchange, fees] of Object.entries(FEE_CONFIG)) {
      expect(fees.takerFee.gt(0), `${exchange} taker > 0`).toBe(true);
      expect(fees.takerFee.lte(0.01), `${exchange} taker <= 1%`).toBe(true);
      expect(fees.makerFee.gte(0), `${exchange} maker >= 0`).toBe(true);
    }
  });

  it('withdrawal fees should be positive and reasonable', () => {
    for (const [exchange, fees] of Object.entries(FEE_CONFIG)) {
      expect(fees.withdrawalFeeBTC.gt(0), `${exchange} withdrawal > 0`).toBe(true);
      expect(fees.withdrawalFeeBTC.lt(0.01), `${exchange} withdrawal < 0.01 BTC`).toBe(true);
    }
  });

  it('should calculate net cost correctly for a buy', () => {
    const price = new Decimal('73000');
    const quantity = new Decimal('1');
    const fee = FEE_CONFIG.binance.takerFee; // 0.001

    const grossCost = price.mul(quantity);
    const feeCost = grossCost.mul(fee);
    const netCost = grossCost.plus(feeCost);

    expect(netCost.toString()).toBe('73073'); // 73000 + 73 = 73073
  });

  it('should calculate net revenue correctly for a sell', () => {
    const price = new Decimal('73000');
    const quantity = new Decimal('1');
    const fee = FEE_CONFIG.binance.takerFee; // 0.001

    const grossRevenue = price.mul(quantity);
    const feeCost = grossRevenue.mul(fee);
    const netRevenue = grossRevenue.minus(feeCost);

    expect(netRevenue.toString()).toBe('72927'); // 73000 - 73 = 72927
  });

  it('should calculate arbitrage net profit correctly', () => {
    const buyPrice = new Decimal('73000'); // Ask on exchange A
    const sellPrice = new Decimal('73100'); // Bid on exchange B
    const buyFee = FEE_CONFIG.binance.takerFee; // 0.001
    const sellFee = FEE_CONFIG.okx.takerFee; // 0.001

    const buyCost = buyPrice.mul(new Decimal(1).plus(buyFee)); // 73000 * 1.001 = 73073
    const sellRevenue = sellPrice.mul(new Decimal(1).minus(sellFee)); // 73100 * 0.999 = 73026.9

    const netProfit = sellRevenue.minus(buyCost); // 73026.9 - 73073 = -46.1

    expect(netProfit.lt(0)).toBe(true); // Even $100 spread isn't enough with 0.2% combined fees
    expect(netProfit.toFixed(1)).toBe('-46.1');
  });

  it('should be profitable with large enough spread', () => {
    const buyPrice = new Decimal('73000');
    const sellPrice = new Decimal('73200'); // $200 spread
    const buyFee = FEE_CONFIG.binance.takerFee;
    const sellFee = FEE_CONFIG.okx.takerFee;

    const buyCost = buyPrice.mul(new Decimal(1).plus(buyFee));
    const sellRevenue = sellPrice.mul(new Decimal(1).minus(sellFee));
    const netProfit = sellRevenue.minus(buyCost);

    expect(netProfit.gt(0)).toBe(true); // $200 spread > combined fees
    expect(netProfit.toFixed(1)).toBe('53.8');
  });
});
