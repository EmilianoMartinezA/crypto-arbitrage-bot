FROM node:20-alpine AS base

# Bot builder
FROM base AS builder
WORKDIR /app
COPY tsconfig.base.json package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/bot/package.json ./apps/bot/
RUN apk add --no-cache python3 make g++ && npm ci
COPY packages/shared/ ./packages/shared/
COPY apps/bot/ ./apps/bot/
RUN npm run build -w packages/shared
RUN npm run build -w apps/bot

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 botuser
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --from=builder /app/apps/bot/package.json ./apps/bot/
RUN mkdir -p /app/data && chown botuser:nodejs /app/data
USER botuser
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "apps/bot/dist/index.js"]
