FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git openssl
RUN npm install -g pnpm
ENV PRISMA_BINARY_TARGETS=linux-musl-openssl-3.0.x
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/shared build
RUN pnpm --filter @citadelmd/backend build

FROM node:20-alpine
RUN apk add --no-cache git openssl
ENV PRISMA_BINARY_TARGETS=linux-musl-openssl-3.0.x
WORKDIR /app
COPY --from=build /app/ ./
COPY apps/backend/prisma ./apps/backend/prisma
WORKDIR /app/apps/backend
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && node dist/index.js"]
