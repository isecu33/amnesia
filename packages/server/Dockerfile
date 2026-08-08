# Servidor TÓTEM — docs/02 §8. Un solo proceso, salas en memoria (sin BD en MVP).
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY tools/sim/package.json tools/sim/
RUN pnpm install --frozen-lockfile --filter @totem/server...

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
COPY packages/core packages/core
COPY packages/protocol packages/protocol
COPY packages/server packages/server
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:2567/hc || exit 1
CMD ["pnpm", "--filter", "@totem/server", "start"]
