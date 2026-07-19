FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/mcp-server ./apps/mcp-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/mcp-server build
RUN pnpm --filter @citadelmd/mcp-server --prod deploy /tmp/pruned

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /tmp/pruned ./
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3100
CMD ["node", "dist/index.js"]
