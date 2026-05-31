'use client';

interface HeaderProps {
  connected: boolean;
  exchangeCount: number;
}

export function Header({ connected, exchangeCount }: HeaderProps) {
  return (
    <header className="relative overflow-hidden border-b border-white/5 bg-surface/80 backdrop-blur-md">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-accent-blue/20 blur-3xl" />
        <div className="absolute -top-12 right-1/4 h-36 w-36 rounded-full bg-accent-purple/15 blur-3xl" />
        <div className="absolute -bottom-12 right-12 h-40 w-40 rounded-full bg-accent-cyan/10 blur-3xl" />
      </div>

      {/* Animated gradient border bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px]">
        <div
          className="h-full w-full animate-gradient bg-300%"
          style={{
            backgroundImage: 'linear-gradient(90deg, transparent, rgba(51,102,255,0.5), rgba(168,85,247,0.5), rgba(6,182,212,0.5), transparent)',
          }}
        />
      </div>

      <div className="relative px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Logo + Title */}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="relative text-lg font-bold text-white sm:text-xl">
                <span className="relative">
                  Arbitrage Engine
                  {/* Shimmer overlay */}
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%] bg-clip-text animate-[shimmer_3s_infinite]"
                    aria-hidden="true"
                  />
                </span>
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 sm:text-xs">
                <span className="font-mono">7 exchanges</span>
                <span className="text-white/20">•</span>
                <span>Real-time detection</span>
                <span className="text-white/20">•</span>
                <span className="hidden xs:inline">Triangular + Cross-exchange</span>
                <span className="xs:hidden">Tri + Cross</span>
              </div>
            </div>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
                connected
                  ? 'bg-accent-green/10 text-accent-green ring-accent-green/20'
                  : 'bg-accent-yellow/10 text-accent-yellow ring-accent-yellow/20'
              }`}
            >
              <div className="relative">
                <div className={`h-2 w-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-yellow'}`} />
                {connected && (
                  <div className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-accent-green opacity-75" />
                )}
              </div>
              <span>{connected ? 'LIVE' : 'CONNECTING...'}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
