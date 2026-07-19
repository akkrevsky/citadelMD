FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/backend build
RUN pnpm --filter @citadelmd/backend --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
COPY apps/backend/prisma ./prisma
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["sh", "-c", "node dist/index.js"]
