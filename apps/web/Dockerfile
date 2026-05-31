FROM node:20-alpine AS base

# Web builder
FROM base AS builder
WORKDIR /app
COPY tsconfig.base.json package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci --ignore-scripts
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
RUN npm run build -w packages/shared
RUN npm run build -w apps/web

# Production runner (Next.js standalone)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
