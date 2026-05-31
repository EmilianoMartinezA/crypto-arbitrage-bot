import type { ExchangeName, NormalizedOrderBook } from '@arbitrage/shared';

/**
 * In-memory order book store.
 * Key: `${exchange}:${pair}` → latest NormalizedOrderBook
 * Optimized for O(1) lookups during arbitrage scanning.
 */
class OrderBookStore {
  private books = new Map<string, NormalizedOrderBook>();

  private key(exchange: ExchangeName, pair: string): string {
    return `${exchange}:${pair}`;
  }

  update(book: NormalizedOrderBook): void {
    this.books.set(this.key(book.exchange, book.pair), book);
  }

  get(exchange: ExchangeName, pair: string): NormalizedOrderBook | undefined {
    return this.books.get(this.key(exchange, pair));
  }

  getAll(): NormalizedOrderBook[] {
    return [...this.books.values()];
  }

  getAllForPair(pair: string): NormalizedOrderBook[] {
    const result: NormalizedOrderBook[] = [];
    for (const book of this.books.values()) {
      if (book.pair === pair) {
        result.push(book);
      }
    }
    return result;
  }

  getExchangeCount(): number {
    return this.books.size;
  }

  clear(): void {
    this.books.clear();
  }
}

export const orderBookStore = new OrderBookStore();
