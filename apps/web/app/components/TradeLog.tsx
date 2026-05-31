'use client';

import { useEffect, useRef, useState } from 'react';
import { Tooltip } from './Tooltip';

interface Trade {
  timestamp: number;
  side: string;
  exchange: string;
  price: number;
  volume: number;
  fee: number;
  profit: number;
  latency: number;
  opportunityId?: string;
}

interface TradeLogProps {
  trades: Trade[];
}

export function TradeLog({ trades }: TradeLogProps) {
  const [highlightedRows, setHighlightedRows] = useState<Set<number>>(new Set());
  const prevLengthRef = useRef(trades.length);

  useEffect(() => {
    if (trades.length > prevLengthRef.current) {
      const newTimestamp = trades[0].timestamp;
      setHighlightedRows((prev) => new Set(prev).add(newTimestamp));

      setTimeout(() => {
        setHighlightedRows((prev) => {
          const updated = new Set(prev);
          updated.delete(newTimestamp);
          return updated;
        });
      }, 1000);
    }
    prevLengthRef.current = trades.length;
  }, [trades]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (trades.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg bg-surface-card">
        <div className="text-center">
          <div className="text-lg text-gray-400">No trades executed yet</div>
          <div className="mt-2 text-sm text-gray-500">
            Trades will appear here once executed
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-surface-card">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Trade Log</h2>
        <ExportMenu />
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-elevated">
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                Side
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                Exchange
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">
                Price
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">
                Volume
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">
                Fee
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">
                Profit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">
                Latency
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr
                key={trade.timestamp}
                className={`border-b border-white/5 transition-colors hover:bg-surface-elevated ${
                  highlightedRows.has(trade.timestamp)
                    ? 'animate-flash-green bg-accent-green/20'
                    : ''
                }`}
              >
                <td className="px-4 py-3 font-mono text-sm text-gray-300">
                  {formatTime(trade.timestamp)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                      trade.side === 'BUY'
                        ? 'bg-accent-green/20 text-accent-green'
                        : 'bg-accent-red/20 text-accent-red'
                    }`}
                  >
                    {trade.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-white">
                  {trade.exchange}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-white">
                  {formatCurrency(trade.price)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                  {trade.volume.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                  {formatCurrency(trade.fee)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                    trade.side === 'BUY' && trade.profit === 0
                      ? 'text-gray-500'
                      : trade.profit > 0
                      ? 'text-accent-green'
                      : trade.profit < 0
                      ? 'text-accent-red'
                      : 'text-gray-300'
                  }`}
                >
                  {trade.side === 'BUY' && trade.profit === 0
                    ? (
                      <Tooltip content="Profit is calculated on the SELL leg of each trade pair" position="left">
                        <span className="cursor-help">—</span>
                      </Tooltip>
                    )
                    : trade.profit > 0
                    ? `+${formatCurrency(trade.profit)}`
                    : formatCurrency(trade.profit)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                  {trade.latency}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-gray-400 ring-1 ring-white/10 transition-colors hover:bg-surface-elevated hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg bg-surface-elevated p-1.5 shadow-xl ring-1 ring-white/10">
            <a
              href={`${apiUrl}/api/export/trades.csv`}
              download
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <span>📄</span>
              <span>Trades (.csv)</span>
            </a>
            <a
              href={`${apiUrl}/api/export/opportunities.csv`}
              download
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <span>📊</span>
              <span>Opportunities (.csv)</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
