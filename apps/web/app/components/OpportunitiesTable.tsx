'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface Opportunity {
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

interface OpportunitiesTableProps {
  opportunities: Opportunity[];
}

export function OpportunitiesTable({ opportunities }: OpportunitiesTableProps) {
  const [highlightedRows, setHighlightedRows] = useState<Set<number>>(new Set());
  const prevLengthRef = useRef(opportunities.length);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pairFilter, setPairFilter] = useState<string>('all');
  const [exchangeFilter, setExchangeFilter] = useState<string>('all');

  useEffect(() => {
    if (opportunities.length > prevLengthRef.current) {
      const newTimestamp = opportunities[0]?.timestamp;
      if (newTimestamp) {
        setHighlightedRows((prev) => new Set(prev).add(newTimestamp));
        setTimeout(() => {
          setHighlightedRows((prev) => {
            const updated = new Set(prev);
            updated.delete(newTimestamp);
            return updated;
          });
        }, 1000);
      }
    }
    prevLengthRef.current = opportunities.length;
  }, [opportunities]);

  // Compute unique values for filter dropdowns
  const uniquePairs = useMemo(() => [...new Set(opportunities.map((o) => o.pair))], [opportunities]);
  const uniqueExchanges = useMemo(() => {
    const all = new Set<string>();
    opportunities.forEach((o) => { all.add(o.buyExchange); all.add(o.sellExchange); });
    return [...all].sort();
  }, [opportunities]);

  // Apply filters
  const filtered = useMemo(() => {
    return opportunities.filter((opp) => {
      if (typeFilter !== 'all' && opp.type !== typeFilter) return false;
      if (pairFilter !== 'all' && opp.pair !== pairFilter) return false;
      if (exchangeFilter !== 'all' && opp.buyExchange !== exchangeFilter && opp.sellExchange !== exchangeFilter) return false;
      return true;
    });
  }, [opportunities, typeFilter, pairFilter, exchangeFilter]);

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

  if (opportunities.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg bg-surface-card">
        <div className="text-center">
          <div className="text-lg text-gray-400">No opportunities detected yet</div>
          <div className="mt-2 text-sm text-gray-500">
            Waiting for arbitrage opportunities...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-lg bg-surface-card">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Arbitrage Opportunities</h2>
          <span className="text-xs text-gray-500">{filtered.length}/{opportunities.length}</span>
        </div>

        {/* Filter chips */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded bg-surface-elevated px-2 py-1 text-xs text-gray-300 border border-white/10 focus:border-accent-blue focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="simple">↔ Simple</option>
            <option value="triangular">🔺 Triangular</option>
            <option value="statistical">STAT</option>
          </select>

          <select
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value)}
            className="rounded bg-surface-elevated px-2 py-1 text-xs text-gray-300 border border-white/10 focus:border-accent-blue focus:outline-none"
          >
            <option value="all">All Pairs</option>
            {uniquePairs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value)}
            className="rounded bg-surface-elevated px-2 py-1 text-xs text-gray-300 border border-white/10 focus:border-accent-blue focus:outline-none"
          >
            <option value="all">All Exchanges</option>
            {uniqueExchanges.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
          </select>

          {(typeFilter !== 'all' || pairFilter !== 'all' || exchangeFilter !== 'all') && (
            <button
              onClick={() => { setTypeFilter('all'); setPairFilter('all'); setExchangeFilter('all'); }}
              className="rounded bg-accent-red/20 px-2 py-1 text-xs text-accent-red hover:bg-accent-red/30"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[350px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-elevated">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Time</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Buy</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Sell</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Spread</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Net</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((opp, idx) => (
              <tr
                key={`${opp.timestamp}-${idx}`}
                className={`border-b border-white/5 transition-colors hover:bg-surface-elevated ${
                  highlightedRows.has(opp.timestamp)
                    ? 'animate-flash-green bg-accent-green/20'
                    : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs text-gray-400">
                  {formatTime(opp.timestamp)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      opp.type === 'triangular'
                        ? 'bg-accent-yellow/20 text-accent-yellow'
                        : opp.type === 'statistical'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-accent-blue/20 text-accent-blue'
                    }`}
                  >
                    {opp.type === 'triangular' ? '🔺 TRI' : opp.type === 'statistical' ? 'STAT' : '↔ SIMPLE'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs font-medium text-white">{opp.buyExchange}</td>
                <td className="px-3 py-2 text-xs font-medium text-white">{opp.sellExchange}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-accent-green">
                  {formatCurrency(opp.spread)}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${opp.netProfit >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatCurrency(opp.netProfit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
