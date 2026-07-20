FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git openssl
RUN npm install -g pnpm
ENV PRISMA_BINARY_TARGETS=linux-musl-openssl-3.0.x
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @citadelmd/shared build
# Generate Prisma client so the backend's tsc build sees typed query results
RUN pnpm --filter @citadelmd/backend exec prisma generate
RUN pnpm --filter @citadelmd/backend build

FROM node:20-alpine
RUN apk add --no-cache git openssl
ENV PRISMA_BINARY_TARGETS=linux-musl-openssl-3.0.x
WORKDIR /app
COPY --from=build /app/ ./
COPY apps/backend/prisma ./apps/backend/prisma
WORKDIR /app/apps/backend
# Run as non-root uid 1000 (matches host user sp) so document files stay host-writable
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["node", "dist/index.js"]
