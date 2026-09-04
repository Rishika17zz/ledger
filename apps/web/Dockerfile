FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @ledger/web... --filter @ledger/core... || \
    pnpm install --filter @ledger/web... --filter @ledger/core...

FROM deps AS builder
COPY packages/core packages/core
COPY packages/config packages/config
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
WORKDIR /repo/apps/web
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next /repo/apps/web/.next
COPY --from=builder /repo/apps/web/public /repo/apps/web/public
COPY --from=builder /repo/apps/web/package.json /repo/apps/web/package.json
COPY --from=builder /repo/apps/web/next.config.mjs /repo/apps/web/next.config.mjs
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/apps/web/node_modules /repo/apps/web/node_modules
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
