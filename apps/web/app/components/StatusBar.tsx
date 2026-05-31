'use client';

import { useEffect, useState } from 'react';
import { Tooltip } from './Tooltip';
import { AnimatedCounter } from './AnimatedCounter';

interface StatusBarProps {
  uptime: number;
  totalPnL: number;
  connectedExchanges: number;
  totalOpportunities: number;
  totalTrades: number;
  circuitBreaker: boolean;
  avgLatencyMs: number;
}

export function StatusBar({
  uptime,
  totalPnL,
  connectedExchanges,
  totalOpportunities,
  totalTrades,
  circuitBreaker,
  avgLatencyMs,
}: StatusBarProps) {
  const [formattedUptime, setFormattedUptime] = useState('00:00:00');

  useEffect(() => {
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    setFormattedUptime(
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    );
  }, [uptime]);

  return (
    <div className="border-b border-white/5 bg-surface-card/80 backdrop-blur-sm">
      <div className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex lg:items-center lg:justify-between lg:gap-6">
          {/* P&L — hero metric, always prominent */}
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-surface-elevated/50 px-4 py-2.5 ring-1 ring-white/5 sm:col-span-4 lg:flex-none lg:gap-3">
            <Tooltip content="Cumulative profit/loss from all simulated trades (after fees). Negative = fees exceed spread gains." position="bottom">
              <div className="text-xs text-gray-400 cursor-help sm:text-sm">Total P&amp;L</div>
            </Tooltip>
            <AnimatedCounter
              value={totalPnL}
              prefix="$"
              decimals={2}
              colorize
              className="font-mono text-xl font-bold sm:text-2xl"
            />
          </div>

          {/* Secondary metrics */}
          <Metric
            label="Uptime"
            tooltip="Time since the bot started scanning for arbitrage opportunities"
          >
            <span className="font-mono text-sm font-semibold text-white sm:text-base">
              {formattedUptime}
            </span>
          </Metric>

          <Metric
            label="Exchanges"
            tooltip="Number of exchanges actively connected via WebSocket. 7 total available."
          >
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <div className="h-2 w-2 rounded-full bg-accent-green" />
                <div className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-accent-green opacity-75" />
              </div>
              <span className="font-mono text-sm font-semibold text-white sm:text-base">
                {connectedExchanges}/7
              </span>
            </div>
          </Metric>

          <Metric
            label="Opportunities"
            tooltip="Total arbitrage opportunities detected (simple + triangular + statistical). Not all are profitable after fees."
          >
            <AnimatedCounter
              value={totalOpportunities}
              decimals={0}
              className="font-mono text-sm font-semibold text-white sm:text-base"
            />
          </Metric>

          <Metric
            label="Trades"
            tooltip="Number of trade pairs executed (buy + sell). Only triggers when spread > $5 threshold."
          >
            <AnimatedCounter
              value={totalTrades}
              decimals={0}
              className="font-mono text-sm font-semibold text-white sm:text-base"
            />
          </Metric>

          <Metric
            label="Latency"
            tooltip="Average time from opportunity detection to trade execution. Lower = faster reaction to arbitrage."
          >
            <span className="font-mono text-sm font-semibold text-accent-blue sm:text-base">
              {avgLatencyMs.toFixed(1)}ms
            </span>
          </Metric>

          <Metric
            label="Circuit"
            tooltip="Safety mechanism: pauses trading if price volatility exceeds 5% in 15 seconds. ACTIVE = halted."
          >
            <div
              className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold sm:px-3 sm:py-1 sm:text-sm ${
                circuitBreaker
                  ? 'bg-accent-red/20 text-accent-red'
                  : 'bg-accent-green/20 text-accent-green'
              }`}
            >
              {circuitBreaker ? 'HALT' : 'OK'}
            </div>
          </Metric>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Tooltip content={tooltip} position="bottom">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 cursor-help sm:text-xs">
          {label}
        </div>
      </Tooltip>
      {children}
    </div>
  );
}
