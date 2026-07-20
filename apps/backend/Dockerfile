FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/shared build
RUN pnpm --filter @citadelmd/backend build

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /app/ ./
COPY apps/backend/prisma ./apps/backend/prisma
WORKDIR /app/apps/backend
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3000
CMD ["node", "dist/index.js"]
