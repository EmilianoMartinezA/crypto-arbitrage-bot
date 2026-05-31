#!/bin/bash
# Start both bot and web dashboard in parallel
# Usage: ./dev.sh

echo "🚀 Starting Bitcoin Arbitrage Bot + Dashboard..."
echo ""

# Start bot in background
echo "📡 Starting bot on :4000..."
npx tsx apps/bot/src/index.ts &
BOT_PID=$!

# Wait for bot to be ready
sleep 3

# Start Next.js frontend
echo "🌐 Starting dashboard on :3000..."
NEXT_PUBLIC_API_URL=http://localhost:4000 npx next dev -p 3000 --dir apps/web &
NEXT_PID=$!
cd ../..

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Dashboard: http://localhost:3000"
echo "✅ Bot API:   http://localhost:4000/api/status"
echo "═══════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both"

# Trap Ctrl+C to kill both
trap "echo ''; echo '🛑 Stopping...'; kill $BOT_PID $NEXT_PID 2>/dev/null; exit" INT TERM

# Wait for either to exit
wait
