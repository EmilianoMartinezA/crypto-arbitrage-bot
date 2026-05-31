'use client';

import { useCallback, useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { ExchangePanel } from './components/ExchangePanel';
import { OpportunitiesTable } from './components/OpportunitiesTable';
import { TradeLog } from './components/TradeLog';
import { PnLChart } from './components/PnLChart';
import { SpreadMatrix } from './components/SpreadMatrix';
import { TradeToast, ToastData } from './components/TradeToast';
import { AnimatedBackground } from './components/AnimatedBackground';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const handleDismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const { exchanges, opportunities, trades, status, connected } = useSSE(
    `${API_URL}/events`,
    {
      onTrade: (trade) => {
        const toast: ToastData = {
          id: `${trade.timestamp}-${trade.exchange}-${trade.side}`,
          side: trade.side,
          exchange: trade.exchange,
          price: trade.price,
          volume: trade.volume,
          profit: trade.profit,
          latency: trade.latency,
        };
        setToasts((prev) => [...prev, toast].slice(-5));
      },
    }
  );

  const avgLatencyMs = trades.length > 0
    ? trades.reduce((sum, t) => sum + t.latency, 0) / trades.length
    : 0;

  return (
    <div className="relative min-h-screen bg-surface">
      <AnimatedBackground />

      <div className="relative z-10">

      {/* Header — branding + live status */}
      <Header connected={connected} exchangeCount={status.connectedExchanges} />

      {/* Metrics Bar */}
      <StatusBar
        uptime={status.uptime}
        totalPnL={status.totalPnL}
        connectedExchanges={status.connectedExchanges}
        totalOpportunities={status.totalOpportunities}
        totalTrades={status.totalTrades}
        circuitBreaker={status.circuitBreaker}
        avgLatencyMs={avgLatencyMs}
      />

      {/* Main Content */}
      <main className="p-3 sm:p-4 lg:p-6">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-12">
          {/* Row 1: Exchange Cards */}
          <section className="md:col-span-2 lg:col-span-8 min-h-[200px]">
            <ExchangePanel exchanges={exchanges} />
          </section>

          {/* Spread Matrix */}
          <section className="md:col-span-2 lg:col-span-4 min-h-[200px]">
            <SpreadMatrix exchanges={exchanges} />
          </section>

          {/* Row 2: P&L Chart */}
          <section className="md:col-span-2 lg:col-span-8 min-h-[300px]">
            <PnLChart opportunities={opportunities} trades={trades} />
          </section>

          {/* Opportunities Table */}
          <section className="md:col-span-2 lg:col-span-4 min-h-[300px]">
            <OpportunitiesTable opportunities={opportunities} />
          </section>

          {/* Row 3: Trade Log */}
          <section className="md:col-span-2 lg:col-span-12">
            <TradeLog trades={trades} />
          </section>
        </div>
      </main>
      </div>

      {/* Toast Notifications */}
      <TradeToast toasts={toasts} onDismiss={handleDismiss} />

      {/* Reconnecting indicator */}
      {!connected && (
        <div className="fixed bottom-6 left-6 z-50 rounded-lg bg-accent-yellow/20 px-4 py-3 text-sm text-accent-yellow shadow-lg ring-1 ring-accent-yellow/20 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent-yellow" />
            <span>Reconnecting to server...</span>
          </div>
        </div>
      )}
    </div>
  );
}
