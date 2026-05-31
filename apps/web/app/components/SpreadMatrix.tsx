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

interface SpreadMatrixProps {
  exchanges: Exchange[];
}

export function SpreadMatrix({ exchanges }: SpreadMatrixProps) {
  const matrix = useMemo(() => {
    const result: {
      buyExchange: string;
      sellExchange: string;
      spread: number;
      profit: number;
    }[][] = [];

    exchanges.forEach((buyExchange) => {
      const row: {
        buyExchange: string;
        sellExchange: string;
        spread: number;
        profit: number;
      }[] = [];

      exchanges.forEach((sellExchange) => {
        if (buyExchange.exchange === sellExchange.exchange) {
          row.push({
            buyExchange: buyExchange.exchange,
            sellExchange: sellExchange.exchange,
            spread: 0,
            profit: 0,
          });
        } else {
          const hasBothPrices = buyExchange.bestAsk > 1000 && sellExchange.bestBid > 1000;
          const profit = hasBothPrices ? sellExchange.bestBid - buyExchange.bestAsk : 0;
          const spread = hasBothPrices ? (profit / buyExchange.bestAsk) * 100 : 0;

          row.push({
            buyExchange: buyExchange.exchange,
            sellExchange: sellExchange.exchange,
            spread: isFinite(spread) ? spread : 0,
            profit: isFinite(profit) ? profit : 0,
          });
        }
      });

      result.push(row);
    });

    return result;
  }, [exchanges]);

  const getColor = (spread: number) => {
    if (spread === 0) return 'bg-gray-700';
    if (spread < 0) return 'bg-accent-red/20';

    const intensity = Math.min(spread / 0.5, 1);
    const opacity = Math.floor(20 + intensity * 40);
    return `bg-accent-green/${opacity}`;
  };

  const getColorStyle = (spread: number) => {
    if (spread === 0) return { backgroundColor: '#374151' };
    if (spread < 0) {
      const intensity = Math.min(Math.abs(spread) / 0.5, 1);
      return { backgroundColor: `rgba(255, 61, 113, ${0.2 + intensity * 0.3})` };
    }

    const intensity = Math.min(spread / 0.5, 1);
    return { backgroundColor: `rgba(0, 214, 143, ${0.2 + intensity * 0.3})` };
  };

  const formatSpread = (spread: number) => {
    if (spread === 0) return '-';
    return `${spread >= 0 ? '+' : ''}${spread.toFixed(3)}%`;
  };

  if (exchanges.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-surface-card">
        <div className="text-center">
          <div className="text-lg text-gray-400">No data available</div>
          <div className="mt-2 text-sm text-gray-500">
            Waiting for exchange data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-lg bg-surface-card">
      <div className="border-b border-white/10 px-4 py-3">
        <Tooltip content="Shows % price spread between each exchange pair. Green = profitable arb opportunity (buy row, sell column)." position="bottom">
          <h2 className="text-lg font-semibold text-white cursor-help">Spread Matrix ⓘ</h2>
        </Tooltip>
        <div className="mt-1 text-xs text-gray-400">
          Buy (rows) → Sell (columns)
        </div>
      </div>

      <div className="max-h-[500px] overflow-auto p-4">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-surface-card p-2"></th>
                {exchanges.map((exchange) => (
                  <th
                    key={exchange.exchange}
                    className="bg-surface-elevated p-2 text-center text-xs font-medium text-gray-400"
                  >
                    <div className="min-w-[60px]">{exchange.exchange}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rowIndex) => (
                <tr key={exchanges[rowIndex].exchange}>
                  <td className="sticky left-0 z-10 bg-surface-elevated p-2 text-left text-xs font-medium text-gray-400">
                    <div className="min-w-[60px]">
                      {exchanges[rowIndex].exchange}
                    </div>
                  </td>
                  {row.map((cell, colIndex) => (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className="border border-white/5 p-0"
                      style={getColorStyle(cell.spread)}
                    >
                      <Tooltip
                        content={
                          cell.spread === 0
                            ? `Same exchange — no arb possible`
                            : `Buy on ${cell.buyExchange} (ask) → Sell on ${cell.sellExchange} (bid). Spread: ${cell.spread.toFixed(4)}%. Gross profit: $${cell.profit.toFixed(2)}`
                        }
                        position="top"
                      >
                        <div className="flex h-16 w-full items-center justify-center cursor-help">
                          <div
                            className={`font-mono text-xs font-semibold ${
                              cell.spread === 0
                                ? 'text-gray-500'
                                : cell.spread > 0
                                ? 'text-accent-green'
                                : 'text-accent-red'
                            }`}
                          >
                            {formatSpread(cell.spread)}
                          </div>
                        </div>
                      </Tooltip>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded"
              style={{ backgroundColor: 'rgba(0, 214, 143, 0.5)' }}
            />
            <span>Profitable</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-gray-700" />
            <span>Same</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded"
              style={{ backgroundColor: 'rgba(255, 61, 113, 0.5)' }}
            />
            <span>Unprofitable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
