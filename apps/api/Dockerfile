# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY prisma/schema.prisma prisma/schema.prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cat-diary/api... build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @cat-diary/api deploy --prod --legacy /prod/api
RUN cp -R /workspace/prisma /prod/api/prisma \
    && cd /prod/api \
    && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
RUN mkdir -p /app/output/uploads /app/output/exports && chown -R node:node /app/output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
