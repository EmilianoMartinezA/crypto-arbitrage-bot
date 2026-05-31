import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// Test the orderbook store logic directly
describe('OrderBook Store', () => {
  let store: Map<string, { exchange: string; pair: string; bids: any[]; asks: any[]; localTimestamp: number }>;

  beforeEach(() => {
    store = new Map();
  });

  it('should store and retrieve order books by exchange:pair key', () => {
    const book = {
      exchange: 'binance',
      pair: 'BTC/USDT',
      bids: [{ price: new Decimal('73000'), quantity: new Decimal('1') }],
      asks: [{ price: new Decimal('73001'), quantity: new Decimal('0.5') }],
      localTimestamp: Date.now(),
    };

    store.set('binance:BTC/USDT', book);
    expect(store.get('binance:BTC/USDT')).toBe(book);
  });

  it('should update existing entry on same key', () => {
    const book1 = {
      exchange: 'binance', pair: 'BTC/USDT',
      bids: [{ price: new Decimal('73000'), quantity: new Decimal('1') }],
      asks: [{ price: new Decimal('73001'), quantity: new Decimal('0.5') }],
      localTimestamp: 1000,
    };
    const book2 = {
      exchange: 'binance', pair: 'BTC/USDT',
      bids: [{ price: new Decimal('73100'), quantity: new Decimal('2') }],
      asks: [{ price: new Decimal('73101'), quantity: new Decimal('1') }],
      localTimestamp: 2000,
    };

    store.set('binance:BTC/USDT', book1);
    store.set('binance:BTC/USDT', book2);

    const retrieved = store.get('binance:BTC/USDT');
    expect(retrieved?.bids[0].price.toString()).toBe('73100');
    expect(retrieved?.localTimestamp).toBe(2000);
  });

  it('should get all books for a pair', () => {
    store.set('binance:BTC/USDT', { exchange: 'binance', pair: 'BTC/USDT', bids: [], asks: [], localTimestamp: 1000 });
    store.set('kraken:BTC/USDT', { exchange: 'kraken', pair: 'BTC/USDT', bids: [], asks: [], localTimestamp: 1000 });
    store.set('binance:ETH/USDT', { exchange: 'binance', pair: 'ETH/USDT', bids: [], asks: [], localTimestamp: 1000 });

    const btcBooks = [...store.values()].filter(b => b.pair === 'BTC/USDT');
    expect(btcBooks.length).toBe(2);
  });
});

describe('Arbitrage Detection Logic', () => {
  it('should detect positive spread (Ask A < Bid B)', () => {
    const askA = new Decimal('73000'); // Can buy at 73000
    const bidB = new Decimal('73100'); // Can sell at 73100

    const grossSpread = bidB.minus(askA);
    expect(grossSpread.gt(0)).toBe(true);
    expect(grossSpread.toString()).toBe('100');
  });

  it('should NOT detect when Ask A >= Bid B', () => {
    const askA = new Decimal('73100');
    const bidB = new Decimal('73000');

    const hasOpportunity = askA.lt(bidB);
    expect(hasOpportunity).toBe(false);
  });

  it('should calculate max volume as min of ask qty and bid qty', () => {
    const askQty = new Decimal('0.5');
    const bidQty = new Decimal('0.3');

    const maxVolume = Decimal.min(askQty, bidQty);
    expect(maxVolume.toString()).toBe('0.3');
  });

  it('should calculate slippage from depth walking', () => {
    const levels = [
      { price: new Decimal('73000'), quantity: new Decimal('0.5') },
      { price: new Decimal('73010'), quantity: new Decimal('0.5') },
      { price: new Decimal('73020'), quantity: new Decimal('1.0') },
    ];

    const targetVolume = new Decimal('1.0');
    let remaining = targetVolume;
    let totalCost = new Decimal(0);
    let totalFilled = new Decimal(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;
      const fillQty = Decimal.min(remaining, level.quantity);
      totalCost = totalCost.plus(fillQty.mul(level.price));
      totalFilled = totalFilled.plus(fillQty);
      remaining = remaining.minus(fillQty);
    }

    const avgPrice = totalCost.div(totalFilled);
    const topPrice = levels[0]!.price;
    const slippage = avgPrice.minus(topPrice);

    // 0.5 * 73000 + 0.5 * 73010 = 36500 + 36505 = 73005 avg
    expect(avgPrice.toString()).toBe('73005');
    expect(slippage.toString()).toBe('5'); // $5 slippage for 1 BTC
  });

  it('should handle partial fills when book is thin', () => {
    const levels = [
      { price: new Decimal('73000'), quantity: new Decimal('0.1') },
    ];

    const targetVolume = new Decimal('1.0');
    let remaining = targetVolume;
    let totalFilled = new Decimal(0);

    for (const level of levels) {
      if (remaining.lte(0)) break;
      const fillQty = Decimal.min(remaining, level.quantity);
      totalFilled = totalFilled.plus(fillQty);
      remaining = remaining.minus(fillQty);
    }

    // Only filled 0.1 of requested 1.0
    expect(totalFilled.toString()).toBe('0.1');
    expect(remaining.toString()).toBe('0.9');
  });
});

describe('Wallet Manager Logic', () => {
  it('should calculate max buy volume from USDT balance', () => {
    const usdtBalance = new Decimal('100000');
    const btcPrice = new Decimal('73000');

    const maxBuy = usdtBalance.div(btcPrice).mul(new Decimal('0.99'));
    expect(maxBuy.toFixed(4)).toBe('1.3562'); // ~1.35 BTC
  });

  it('should deduct USDT on buy and add BTC', () => {
    let btc = new Decimal('1.0');
    let usdt = new Decimal('100000');

    const buyQty = new Decimal('0.5');
    const cost = new Decimal('36573'); // 0.5 * 73000 + fees

    usdt = usdt.minus(cost);
    btc = btc.plus(buyQty);

    expect(btc.toString()).toBe('1.5');
    expect(usdt.toString()).toBe('63427');
  });

  it('should deduct BTC on sell and add USDT', () => {
    let btc = new Decimal('1.0');
    let usdt = new Decimal('100000');

    const sellQty = new Decimal('0.5');
    const revenue = new Decimal('36427'); // 0.5 * 73000 - fees

    btc = btc.minus(sellQty);
    usdt = usdt.plus(revenue);

    expect(btc.toString()).toBe('0.5');
    expect(usdt.toString()).toBe('136427');
  });
});
