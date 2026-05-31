'use client';

import { useMemo } from 'react';
import { Tooltip } from './Tooltip';

interface Exchange {
  exchange: string;
  pair: string;
  bestBid: number;
  bestAsk: number;
  connected: boolean;
  bookAge: number;
  depth: number;
}

interface ExchangePanelProps {
  exchanges: Exchange[];
}

export function ExchangePanel({ exchanges }: ExchangePanelProps) {
  const sortedExchanges = useMemo(() => {
    return [...exchanges].sort((a, b) => {
      const spreadA = a.bestAsk - a.bestBid;
      const spreadB = b.bestAsk - b.bestBid;
      return spreadA - spreadB;
    });
  }, [exchanges]);

  const formatCurrency = (value: number) => {
    if (!value || isNaN(value)) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatSpread = (bid: number, ask: number) => {
    if (!bid || !ask || isNaN(bid) || isNaN(ask)) return '—';
    const spread = ask - bid;
    const percentage = ((spread / bid) * 100).toFixed(3);
    return `${formatCurrency(spread)} (${percentage}%)`;
  };

  if (exchanges.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-surface-card p-8">
        <div className="text-center">
          <div className="text-lg text-gray-400">No exchanges connected</div>
          <div className="mt-2 text-sm text-gray-500">
            Waiting for orderbook data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {sortedExchanges.map((exchange) => (
        <div
          key={`${exchange.exchange}:${exchange.pair}`}
          className={`rounded-lg p-4 transition-all hover:bg-surface-elevated ${
            exchange.bookAge > 5000
              ? 'bg-surface-card border border-accent-red/30 opacity-60'
              : exchange.bookAge > 2000
              ? 'bg-surface-card border border-accent-yellow/30'
              : 'bg-surface-card'
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">{exchange.exchange}</span>
              <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-mono text-gray-400">{exchange.pair}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {exchange.bookAge > 5000 ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-red" />
                  <span className="text-[9px] font-semibold text-accent-red">STALE</span>
                </>
              ) : exchange.bookAge > 2000 ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-yellow" />
                  <span className="text-[9px] font-semibold text-accent-yellow">SLOW</span>
                </>
              ) : (
                <>
                  <div className="relative">
                    <div className="h-2.5 w-2.5 rounded-full bg-accent-green" />
                    <div className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-accent-green opacity-75" />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Tooltip content="Highest price a buyer is willing to pay on this exchange" position="left">
                <div className="text-xs text-gray-400 cursor-help">Best Bid</div>
              </Tooltip>
              <div className="font-mono text-sm font-semibold text-accent-green">
                {formatCurrency(exchange.bestBid)}
              </div>
            </div>

            <div className="flex justify-between">
              <Tooltip content="Lowest price a seller is asking on this exchange" position="left">
                <div className="text-xs text-gray-400 cursor-help">Best Ask</div>
              </Tooltip>
              <div className="font-mono text-sm font-semibold text-accent-red">
                {formatCurrency(exchange.bestAsk)}
              </div>
            </div>

            <div className="border-t border-white/10 pt-2">
              <div className="flex justify-between">
                <Tooltip content="Difference between ask and bid as %. Tighter spread = more liquid market." position="left">
                  <div className="text-xs text-gray-400 cursor-help">Spread</div>
                </Tooltip>
                <div className="font-mono text-sm font-semibold text-white">
                  {formatSpread(exchange.bestBid, exchange.bestAsk)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Tooltip content="Time since last order book update. >2s = stale data, unreliable for arb." position="left">
                <div className="text-xs text-gray-400 cursor-help">Book Age</div>
              </Tooltip>
              <div
                className={`font-mono text-sm font-semibold ${
                  exchange.bookAge > 2000
                    ? 'text-accent-yellow'
                    : 'text-gray-300'
                }`}
              >
                {(exchange.bookAge / 1000).toFixed(2)}s
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Tooltip content="Number of order book levels tracked. More depth = better price execution for large orders." position="left">
                <div className="text-xs text-gray-400 cursor-help">Depth</div>
              </Tooltip>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-px">
                  {Array.from({ length: Math.min(Math.ceil(exchange.depth / 5), 8) }).map((_, i) => (
                    <div
                      key={i}
                      className="h-3 w-1 rounded-sm bg-accent-blue/60"
                    />
                  ))}
                  {Array.from({ length: Math.max(8 - Math.ceil(exchange.depth / 5), 0) }).map((_, i) => (
                    <div
                      key={`e-${i}`}
                      className="h-3 w-1 rounded-sm bg-white/10"
                    />
                  ))}
                </div>
                <span className="font-mono text-xs text-gray-400">{exchange.depth}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
