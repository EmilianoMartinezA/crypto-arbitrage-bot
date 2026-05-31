'use client';

import { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  LineStyle,
} from 'lightweight-charts';

interface Opportunity {
  timestamp: number;
  spread: number;
  netProfit: number;
}

interface Trade {
  timestamp: number;
  profit: number;
}

interface PnLChartProps {
  opportunities: Opportunity[];
  trades: Trade[];
}

export function PnLChart({ opportunities, trades }: PnLChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const spreadSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const pnlSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1d2e' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      handleScroll: false,
      handleScale: false,
    });

    // Spread area (gross spread detected)
    const spreadSeries = chart.addAreaSeries({
      lineColor: '#3366ff',
      topColor: 'rgba(51, 102, 255, 0.3)',
      bottomColor: 'rgba(51, 102, 255, 0.0)',
      lineWidth: 2,
      title: 'Gross Spread ($)',
    });

    // P&L line (cumulative if trades exist)
    const pnlSeries = chart.addLineSeries({
      color: '#00d68f',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: 'Net P&L ($)',
    });

    chartRef.current = chart;
    spreadSeriesRef.current = spreadSeries;
    pnlSeriesRef.current = pnlSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update spread data from opportunities
  useEffect(() => {
    if (!spreadSeriesRef.current || opportunities.length === 0) return;

    try {
      // Deduplicate by second (take max spread per second), limit to last 120 points
      const bySecond = new Map<number, number>();
      const recent = opportunities.slice(0, 200);
      for (const opp of recent) {
        const sec = Math.floor(opp.timestamp / 1000);
        const existing = bySecond.get(sec) ?? 0;
        if (opp.spread > existing) {
          bySecond.set(sec, opp.spread);
        }
      }

      const data = [...bySecond.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(-120)
        .map(([time, value]) => ({ time: time as any, value }));

      if (data.length > 1) {
        spreadSeriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
      }
    } catch (e) {
      // lightweight-charts can throw on malformed time data, ignore
      console.warn('Chart update error:', e);
    }
  }, [opportunities]);

  // Update P&L line from trades
  useEffect(() => {
    if (!pnlSeriesRef.current || trades.length === 0) return;

    try {
      let cumulative = 0;
      const bySecond = new Map<number, number>();

      // Process trades oldest-first, accumulate P&L
      const sorted = trades.slice().reverse();
      for (const trade of sorted) {
        cumulative += trade.profit;
        const sec = Math.floor(trade.timestamp / 1000);
        bySecond.set(sec, cumulative); // last value per second wins
      }

      const data = [...bySecond.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(-120)
        .map(([time, value]) => ({ time: time as any, value }));

      if (data.length > 1) {
        pnlSeriesRef.current.setData(data);
      }
    } catch (e) {
      console.warn('P&L chart update error:', e);
    }
  }, [trades]);

  const maxSpread = useMemo(() => {
    if (opportunities.length === 0) return 0;
    return Math.max(...opportunities.map((o) => o.spread));
  }, [opportunities]);

  return (
    <div className="h-full overflow-hidden rounded-lg bg-surface-card">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">
          Live Spread &amp; P&amp;L
        </h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-4 rounded bg-accent-blue/60" />
            <span className="text-gray-400">Gross Spread</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded bg-accent-green" />
            <span className="text-gray-400">Net P&amp;L</span>
          </div>
          {maxSpread > 0 && (
            <div className="font-mono text-gray-300">
              Max: ${maxSpread.toFixed(2)}
            </div>
          )}
        </div>
      </div>
      <div
        ref={chartContainerRef}
        className="h-[calc(100%-57px)] w-full"
        style={{ minHeight: '300px' }}
      />
    </div>
  );
}
