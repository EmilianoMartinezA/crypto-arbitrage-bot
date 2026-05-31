'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export interface ToastData {
  id: string;
  side: string;
  exchange: string;
  price: number;
  volume: number;
  profit: number;
  latency: number;
  type?: 'simple' | 'triangular' | 'statistical';
  createdAt?: number;
}

interface TradeToastProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

const HISTORY_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function TradeToast({ toasts, onDismiss }: TradeToastProps) {
  const [history, setHistory] = useState<ToastData[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [popupsEnabled, setPopupsEnabled] = useState(true);
  const prevToastIds = useRef<Set<string>>(new Set());

  // Append new toasts to history
  useEffect(() => {
    for (const toast of toasts) {
      if (!prevToastIds.current.has(toast.id)) {
        prevToastIds.current.add(toast.id);
        const entry = { ...toast, createdAt: Date.now() };
        setHistory((prev) => [entry, ...prev].slice(0, 100));
        if (!panelOpen) {
          setUnreadCount((c) => c + 1);
        }
      }
    }
  }, [toasts, panelOpen]);

  // Auto-expire old entries every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - HISTORY_TTL_MS;
      setHistory((prev) => prev.filter((t) => (t.createdAt || 0) > cutoff));
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen((open) => {
      if (!open) setUnreadCount(0);
      return !open;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setUnreadCount(0);
  }, []);

  return (
    <>
      {/* Floating Toasts */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-4 z-50 flex flex-col gap-2 md:gap-3 pointer-events-none w-[calc(100%-2rem)] max-w-[400px] md:w-[340px] ${!popupsEnabled ? 'hidden' : ''}`}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>

      {/* Notification Bell */}
      <button
        onClick={togglePanel}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 rounded-full bg-surface-elevated px-4 py-3 shadow-2xl ring-1 ring-white/10 transition-all hover:bg-surface-card hover:ring-white/20 hover:scale-105"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-blue px-1.5 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel (Drawer) */}
      <div
        className={`fixed top-0 right-0 z-40 h-full w-[360px] transform transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col bg-surface-elevated/95 backdrop-blur-xl border-l border-white/10 shadow-2xl">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">📋</span>
              <h3 className="text-base font-semibold text-white">Trade History</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-gray-400">
                {history.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Popup Toggle */}
              <button
                onClick={() => setPopupsEnabled((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 transition-colors ${
                  popupsEnabled
                    ? 'bg-accent-blue/10 text-accent-blue ring-accent-blue/20'
                    : 'bg-white/5 text-gray-500 ring-white/10'
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${popupsEnabled ? 'bg-accent-blue' : 'bg-gray-600'}`} />
                {popupsEnabled ? 'Popups ON' : 'Popups OFF'}
              </button>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="rounded-md px-2 py-1 text-[10px] text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={togglePanel}
                className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {history.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl mb-2">🔕</div>
                  <div className="text-sm text-gray-400">No recent trades</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Trades auto-expire after 10 min
                  </div>
                </div>
              </div>
            ) : (
              history.map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))
            )}
          </div>

          {/* Panel Footer */}
          <div className="border-t border-white/10 px-5 py-3">
            <div className="text-[10px] text-gray-500 text-center">
              Notifications auto-expire after 10 minutes
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={togglePanel}
        />
      )}
    </>
  );
}

/* ─── Toast Popup (temporary) ───────────────────────────────── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 4500);
    const removeTimer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, onDismiss]);

  const isBuy = toast.side === 'BUY';
  const profitColor =
    toast.profit > 0
      ? 'text-accent-green'
      : toast.profit < 0
      ? 'text-accent-red'
      : 'text-gray-300';

  const borderColor = isBuy ? 'border-l-accent-blue' : 'border-l-accent-green';
  const typeLabel =
    toast.type === 'triangular'
      ? '△ TRI'
      : toast.type === 'statistical'
      ? '📊 STAT'
      : '⇄ SIMPLE';

  return (
    <div
      className={`pointer-events-auto w-full transform transition-all duration-300 ease-out ${
        exiting
          ? 'md:translate-x-full -translate-y-2 opacity-0 scale-95'
          : 'translate-x-0 translate-y-0 opacity-100 scale-100'
      }`}
      style={{ animation: 'toastIn 0.3s ease-out' }}
    >
      <div
        className={`relative overflow-hidden rounded-lg border-l-4 ${borderColor} bg-surface-elevated shadow-2xl ring-1 ring-white/10`}
      >
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-white/5">
          <div
            className="h-full bg-accent-blue/60 transition-all ease-linear"
            style={{ animation: 'shrink 5s linear forwards' }}
          />
        </div>

        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{isBuy ? '🔵' : '🟢'}</span>
              <span className="text-sm font-bold text-white">
                {toast.side} — {toast.exchange.toUpperCase()}
              </span>
            </div>
            <span className="rounded bg-surface-card px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">
              {typeLabel}
            </span>
          </div>

          {/* Details */}
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-gray-500">Price</div>
              <div className="font-mono font-semibold text-white">
                ${toast.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Volume</div>
              <div className="font-mono font-semibold text-white">
                {toast.volume.toFixed(5)} BTC
              </div>
            </div>
            <div>
              <div className="text-gray-500">P&amp;L</div>
              <div className={`font-mono font-semibold ${profitColor}`}>
                {toast.profit > 0 ? '+' : ''}
                ${toast.profit.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
            <span className="text-[10px] text-gray-500">
              ⚡ {toast.latency.toFixed(0)}ms latency
            </span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── History Item (persistent in panel) ─────────────────────── */

function HistoryItem({ item }: { item: ToastData }) {
  const isBuy = item.side === 'BUY';
  const profitColor =
    item.profit > 0
      ? 'text-accent-green'
      : item.profit < 0
      ? 'text-accent-red'
      : 'text-gray-300';

  const typeLabel =
    item.type === 'triangular'
      ? '△ TRI'
      : item.type === 'statistical'
      ? '📊 STAT'
      : '⇄ SIMPLE';

  const timeAgo = getTimeAgo(item.createdAt || 0);

  return (
    <div className="rounded-lg bg-surface-card/60 px-3 py-2.5 ring-1 ring-white/5 transition-colors hover:ring-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{isBuy ? '🔵' : '🟢'}</span>
          <span className="text-xs font-semibold text-white">
            {item.side} — {item.exchange.toUpperCase()}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400">
            {typeLabel}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">{timeAgo}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-4 text-[11px]">
        <span className="font-mono text-gray-300">
          ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="font-mono text-gray-400">
          {item.volume.toFixed(5)}
        </span>
        <span className={`font-mono font-semibold ${profitColor}`}>
          {item.profit > 0 ? '+' : ''}${item.profit.toFixed(2)}
        </span>
        <span className="text-gray-500">
          ⚡{item.latency.toFixed(0)}ms
        </span>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
