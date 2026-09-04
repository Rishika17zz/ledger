FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @ledger/api... --filter @ledger/database... --filter @ledger/core... || \
    pnpm install --filter @ledger/api... --filter @ledger/database... --filter @ledger/core...

FROM deps AS runtime
COPY packages/core packages/core
COPY packages/database packages/database
COPY packages/config packages/config
COPY apps/api apps/api

WORKDIR /repo/packages/database
RUN pnpm generate

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "start"]
