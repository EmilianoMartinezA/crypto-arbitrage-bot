'use client';

import { useEffect, useRef, useState } from 'react';

export interface Exchange {
  exchange: string;
  pair: string;
  bestBid: number;
  bestAsk: number;
  connected: boolean;
  bookAge: number;
  depth: number;
}

export interface Opportunity {
  timestamp: number;
  type: 'simple' | 'triangular' | 'statistical';
  pair: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  netProfit: number;
  netProfitPercent: number;
  volume: number;
}

export interface Trade {
  timestamp: number;
  side: string;
  exchange: string;
  price: number;
  volume: number;
  fee: number;
  profit: number;
  latency: number;
  opportunityId: string;
}

export interface Status {
  uptime: number;
  totalPnL: number;
  connectedExchanges: number;
  totalOpportunities: number;
  totalTrades: number;
  circuitBreaker: boolean;
}

export interface UseSSEReturn {
  exchanges: Exchange[];
  opportunities: Opportunity[];
  trades: Trade[];
  status: Status;
  connected: boolean;
}

const MAX_OPPORTUNITIES = 50;
const MAX_TRADES = 50;

interface UseSSEOptions {
  onTrade?: (trade: Trade) => void;
}

export function useSSE(url: string, options?: UseSSEOptions): UseSSEReturn {
  const onTradeRef = useRef(options?.onTrade);

  useEffect(() => {
    onTradeRef.current = options?.onTrade;
  }, [options?.onTrade]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<Status>({
    uptime: 0,
    totalPnL: 0,
    connectedExchanges: 0,
    totalOpportunities: 0,
    totalTrades: 0,
    circuitBreaker: false,
  });
  const [connected, setConnected] = useState(false);

  // Hydrate from SQLite history on mount (non-blocking, deferred)
  useEffect(() => {
    const baseUrl = url.replace('/events', '');
    // Defer history fetch so SSE connects first (UX priority)
    const timer = setTimeout(() => {
      fetch(`${baseUrl}/api/history/trades?limit=20`)
        .then((r) => r.json())
        .then((rows: Array<Record<string, unknown>>) => {
          if (!rows.length) return;
          const hydrated: Trade[] = rows.map((row) => ({
            timestamp: row.executed_at as number,
            side: (row.side as string) === 'buy' ? 'BUY' : 'SELL',
            exchange: row.exchange as string,
            price: parseFloat(row.average_price as string) || 0,
            volume: parseFloat(row.filled_quantity as string) || 0,
            fee: parseFloat(row.fee_paid as string) || 0,
            profit: 0,
            latency: row.latency_ms as number,
            opportunityId: row.opportunity_id as string,
          }));
          setTrades((prev) => prev.length === 0 ? hydrated : prev);
        })
        .catch(() => {});

      fetch(`${baseUrl}/api/history/opportunities?limit=30`)
        .then((r) => r.json())
        .then((rows: Array<Record<string, unknown>>) => {
          if (!rows.length) return;
          const hydrated: Opportunity[] = rows.map((row) => ({
            timestamp: row.detected_at as number,
            type: (row.type as string) as 'simple' | 'triangular' | 'statistical',
            pair: row.pair as string,
            buyExchange: row.buy_exchange as string,
            sellExchange: row.sell_exchange as string,
            buyPrice: parseFloat(row.buy_price as string) || 0,
            sellPrice: parseFloat(row.sell_price as string) || 0,
            spread: parseFloat(row.gross_spread as string) || 0,
            netProfit: parseFloat(row.net_profit as string) || 0,
            netProfitPercent: parseFloat(row.net_profit_percent as string) || 0,
            volume: parseFloat(row.max_volume as string) || 0,
          }));
          setOpportunities((prev) => prev.length === 0 ? hydrated.slice(0, MAX_OPPORTUNITIES) : prev);
        })
        .catch(() => {});
    }, 2000); // 2s delay — let SSE connect first

    return () => clearTimeout(timer);
  }, [url]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      try {
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setConnected(true);
        };

        // ─── ORDERBOOK EVENT ───────────────────────────────────────────────
        // Bot sends: { exchange, pair, bestBid: {price, qty} | null, bestAsk: {price, qty} | null, depth, timestamp }
        eventSource.addEventListener('orderbook', (event) => {
          try {
            const data = JSON.parse(event.data);
            const bidPrice = data.bestBid ? parseFloat(data.bestBid.price) : 0;
            const askPrice = data.bestAsk ? parseFloat(data.bestAsk.price) : 0;

            // Skip invalid prices
            if (bidPrice < 1000 && askPrice < 1000) return;

            setExchanges((prev) => {
              const key = `${data.exchange}:${data.pair || 'BTC/USDT'}`;
              const index = prev.findIndex((e) => `${e.exchange}:${e.pair}` === key);
              const newExchange: Exchange = {
                exchange: data.exchange,
                pair: data.pair || 'BTC/USDT',
                bestBid: bidPrice,
                bestAsk: askPrice,
                connected: true,
                bookAge: data.timestamp ? Date.now() - data.timestamp : 0,
                depth: data.depth || 0,
              };

              if (index >= 0) {
                const updated = [...prev];
                updated[index] = newExchange;
                return updated;
              }
              return [...prev, newExchange];
            });
          } catch (error) {
            console.error('Error parsing orderbook:', error);
          }
        });

        // ─── OPPORTUNITY EVENT ─────────────────────────────────────────────
        // Bot sends: { id, type, pair, buyExchange, sellExchange, buyPrice, sellPrice, grossSpread, netProfit, netProfitPercent, maxVolume, estimatedSlippage, detectedAt, executed }
        eventSource.addEventListener('opportunity', (event) => {
          try {
            const data = JSON.parse(event.data);
            const opportunity: Opportunity = {
              timestamp: data.detectedAt || Date.now(),
              type: data.type || 'simple',
              pair: data.pair || 'BTC/USDT',
              buyExchange: data.buyExchange,
              sellExchange: data.sellExchange,
              buyPrice: parseFloat(data.buyPrice) || 0,
              sellPrice: parseFloat(data.sellPrice) || 0,
              spread: parseFloat(data.grossSpread) || 0,
              netProfit: parseFloat(data.netProfit) || 0,
              netProfitPercent: parseFloat(data.netProfitPercent) || 0,
              volume: parseFloat(data.maxVolume) || 0,
            };

            setOpportunities((prev) => [opportunity, ...prev].slice(0, MAX_OPPORTUNITIES));
            setStatus((prev) => ({
              ...prev,
              totalOpportunities: prev.totalOpportunities + 1,
            }));
          } catch (error) {
            console.error('Error parsing opportunity:', error);
          }
        });

        // ─── TRADE EVENT ──────────────────────────────────────────────────
        // Bot sends: { id, opportunityId, exchange, pair, side, requestedQuantity, filledQuantity, averagePrice, totalCost, feePaid, status, executedAt, latencyMs }
        eventSource.addEventListener('trade', (event) => {
          try {
            const data = JSON.parse(event.data);
            const trade: Trade = {
              timestamp: data.executedAt || Date.now(),
              side: data.side === 'buy' ? 'BUY' : 'SELL',
              exchange: data.exchange,
              price: parseFloat(data.averagePrice) || 0,
              volume: parseFloat(data.filledQuantity) || 0,
              fee: parseFloat(data.feePaid) || 0,
              profit: parseFloat(data.profit) || 0,
              latency: data.latencyMs || 0,
              opportunityId: data.opportunityId,
            };

            setTrades((prev) => [trade, ...prev].slice(0, MAX_TRADES));
            setStatus((prev) => ({
              ...prev,
              totalTrades: prev.totalTrades + 1,
            }));
            onTradeRef.current?.(trade);
          } catch (error) {
            console.error('Error parsing trade:', error);
          }
        });

        // ─── STATUS EVENT ─────────────────────────────────────────────────
        // Bot sends: { uptime, exchanges: [{exchange, connected, bookAge, bestBid, bestAsk}], engine: {opportunityCount, scanCount}, trades, pnl, pnlPercent }
        eventSource.addEventListener('status', (event) => {
          try {
            const data = JSON.parse(event.data);
            setStatus((prev) => ({
              uptime: data.uptime || prev.uptime,
              totalPnL: parseFloat(data.pnl) || prev.totalPnL,
              connectedExchanges: data.exchanges?.length || prev.connectedExchanges,
              totalOpportunities: data.engine?.opportunityCount || prev.totalOpportunities,
              totalTrades: data.trades || prev.totalTrades,
              circuitBreaker: false,
            }));

            // Also update exchanges from status
            if (data.exchanges && Array.isArray(data.exchanges)) {
              setExchanges((prev) => {
                const updated = [...prev];
                for (const ex of data.exchanges) {
                  const exPair = ex.pair || 'BTC/USDT';
                  const idx = updated.findIndex((e) => e.exchange === ex.exchange && e.pair === exPair);
                  const entry: Exchange = {
                    exchange: ex.exchange,
                    pair: ex.pair || 'BTC/USDT',
                    bestBid: parseFloat(ex.bestBid) || (idx >= 0 ? updated[idx]!.bestBid : 0),
                    bestAsk: parseFloat(ex.bestAsk) || (idx >= 0 ? updated[idx]!.bestAsk : 0),
                    connected: ex.connected ?? true,
                    bookAge: ex.bookAge || 0,
                    depth: ex.depth || (idx >= 0 ? updated[idx]!.depth : 0),
                  };
                  if (idx >= 0) {
                    updated[idx] = entry;
                  } else {
                    updated.push(entry);
                  }
                }
                return updated;
              });
            }
          } catch (error) {
            console.error('Error parsing status:', error);
          }
        });

        eventSource.onerror = () => {
          setConnected(false);
          eventSource.close();
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };
      } catch (error) {
        console.error('Error creating EventSource:', error);
        setConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [url]);

  return { exchanges, opportunities, trades, status, connected };
}
