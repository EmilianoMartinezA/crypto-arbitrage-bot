import Decimal from 'decimal.js';
import type { ExchangeName, WalletBalance } from '@arbitrage/shared';
import { INITIAL_WALLET } from '@arbitrage/shared';
import { logger } from '../lib/logger.js';

/**
 * Wallet Manager — tracks simulated BTC and USDT balances per exchange.
 * Each exchange starts with 1 BTC + 100,000 USDT.
 */
class WalletManager {
  private wallets = new Map<ExchangeName, WalletBalance>();

  constructor() {
    this.initializeWallets();
  }

  private initializeWallets(): void {
    const exchanges: ExchangeName[] = [
      'binance', 'kraken', 'okx', 'bybit', 'bitfinex', 'kucoin', 'bitstamp',
    ];

    for (const exchange of exchanges) {
      this.wallets.set(exchange, {
        exchange,
        btc: new Decimal(INITIAL_WALLET.btc),
        usdt: new Decimal(INITIAL_WALLET.usdt),
        updatedAt: Date.now(),
      });
    }

    logger.info(`💼 Wallet manager initialized: ${exchanges.length} exchanges × (${INITIAL_WALLET.btc} BTC + $${INITIAL_WALLET.usdt} USDT)`);
  }

  /** Get maximum BTC we can buy given USDT balance and price */
  getMaxBuyVolume(exchange: ExchangeName, price: Decimal): Decimal {
    const wallet = this.wallets.get(exchange);
    if (!wallet) return new Decimal(0);
    // Max BTC = USDT balance / price (leave 1% buffer for fees)
    return wallet.usdt.div(price).mul(new Decimal('0.99'));
  }

  /** Get maximum BTC we can sell from this exchange */
  getMaxSellVolume(exchange: ExchangeName): Decimal {
    const wallet = this.wallets.get(exchange);
    if (!wallet) return new Decimal(0);
    return wallet.btc;
  }

  /** Execute buy: spend USDT, receive BTC */
  executeBuy(exchange: ExchangeName, btcAmount: Decimal, usdtCost: Decimal): void {
    const wallet = this.wallets.get(exchange);
    if (!wallet) return;

    wallet.usdt = wallet.usdt.minus(usdtCost);
    wallet.btc = wallet.btc.plus(btcAmount);
    wallet.updatedAt = Date.now();
  }

  /** Execute sell: spend BTC, receive USDT */
  executeSell(exchange: ExchangeName, btcAmount: Decimal, usdtRevenue: Decimal): void {
    const wallet = this.wallets.get(exchange);
    if (!wallet) return;

    wallet.btc = wallet.btc.minus(btcAmount);
    wallet.usdt = wallet.usdt.plus(usdtRevenue);
    wallet.updatedAt = Date.now();
  }

  /** Get wallet balance for a specific exchange */
  getBalance(exchange: ExchangeName): WalletBalance | undefined {
    return this.wallets.get(exchange);
  }

  /** Get all wallet balances */
  getAllBalances(): WalletBalance[] {
    return [...this.wallets.values()];
  }

  /** Calculate total portfolio value in USDT across all exchanges */
  getTotalPortfolioValue(btcPriceUSD: Decimal): {
    totalBTC: Decimal;
    totalUSDT: Decimal;
    totalValueUSD: Decimal;
    initialValueUSD: Decimal;
    pnlUSD: Decimal;
    pnlPercent: Decimal;
  } {
    let totalBTC = new Decimal(0);
    let totalUSDT = new Decimal(0);

    for (const wallet of this.wallets.values()) {
      totalBTC = totalBTC.plus(wallet.btc);
      totalUSDT = totalUSDT.plus(wallet.usdt);
    }

    const totalValueUSD = totalUSDT.plus(totalBTC.mul(btcPriceUSD));
    const exchangeCount = this.wallets.size;
    const initialValueUSD = new Decimal(INITIAL_WALLET.usdt)
      .plus(new Decimal(INITIAL_WALLET.btc).mul(btcPriceUSD))
      .mul(exchangeCount);
    const pnlUSD = totalValueUSD.minus(initialValueUSD);
    const pnlPercent = initialValueUSD.isZero()
      ? new Decimal(0)
      : pnlUSD.div(initialValueUSD).mul(100);

    return { totalBTC, totalUSDT, totalValueUSD, initialValueUSD, pnlUSD, pnlPercent };
  }
}

export const walletManager = new WalletManager();
