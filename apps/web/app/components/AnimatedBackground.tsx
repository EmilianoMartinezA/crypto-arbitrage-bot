'use client';

import { useEffect, useRef } from 'react';

/**
 * Premium animated background with:
 * 1. Floating gradient orbs (soft, blurred)
 * 2. Particle network (dots connected by faint lines)
 * 3. Subtle grid overlay
 * 4. Radial vignette for depth
 */
export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener('resize', resize);

    // ─── Floating Orbs ─────────────────────────────────────────
    const orbs = [
      { x: 0.15, y: 0.25, radius: 350, color: '51, 102, 255', speed: 0.0002, phase: 0 },
      { x: 0.75, y: 0.15, radius: 280, color: '168, 85, 247', speed: 0.0003, phase: 1.5 },
      { x: 0.5, y: 0.65, radius: 400, color: '6, 182, 212', speed: 0.00015, phase: 3 },
      { x: 0.85, y: 0.55, radius: 220, color: '0, 214, 143', speed: 0.0004, phase: 4.5 },
      { x: 0.1, y: 0.8, radius: 300, color: '99, 102, 241', speed: 0.00025, phase: 2 },
    ];

    // ─── Particle Network ──────────────────────────────────────
    const PARTICLE_COUNT = 65;
    const CONNECTION_DISTANCE = 130;
    const particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
      });
    }

    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      time++;

      // Draw orbs
      for (const orb of orbs) {
        const offsetX = Math.sin(time * orb.speed + orb.phase) * 100;
        const offsetY = Math.cos(time * orb.speed * 0.7 + orb.phase) * 70;

        const x = orb.x * width + offsetX;
        const y = orb.y * height + offsetY;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, orb.radius);
        gradient.addColorStop(0, `rgba(${orb.color}, 0.06)`);
        gradient.addColorStop(0.4, `rgba(${orb.color}, 0.02)`);
        gradient.addColorStop(1, `rgba(${orb.color}, 0)`);

        ctx.beginPath();
        ctx.arc(x, y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Draw particles + connections
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Draw dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill();

        // Draw connections to nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]!;
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.08;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <>
      {/* Canvas for animated orbs + particle network */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
      />
      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.02]"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Noise texture for premium feel */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.015]"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      {/* Radial vignette */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, transparent 40%, rgba(10, 13, 20, 0.7) 100%),
            radial-gradient(ellipse at 50% 100%, transparent 50%, rgba(10, 13, 20, 0.5) 100%)
          `,
        }}
      />
    </>
  );
}
