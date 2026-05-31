'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  colorize?: boolean;
}

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  colorize = false,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const duration = 400; // ms
    const startTime = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
        prevValue.current = end;
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [value]);

  const formatted = `${prefix}${Math.abs(displayValue).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  const sign = displayValue < 0 ? '-' : displayValue > 0 ? '+' : '';

  const colorClass = colorize
    ? displayValue > 0
      ? 'text-accent-green'
      : displayValue < 0
      ? 'text-accent-red'
      : 'text-white'
    : '';

  return (
    <span className={`${className} ${colorClass} transition-colors duration-300`}>
      {colorize ? `${sign}${formatted}` : `${displayValue < 0 ? '-' : ''}${formatted}`}
    </span>
  );
}
