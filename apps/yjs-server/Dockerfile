FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/yjs-server ./apps/yjs-server
COPY packages/shared ./packages/shared
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @citadelmd/shared build
RUN pnpm --filter @citadelmd/yjs-server build

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /app/ ./
WORKDIR /app/apps/yjs-server
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 1234
CMD ["node", "dist/index.js"]
