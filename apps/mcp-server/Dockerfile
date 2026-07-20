FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/mcp-server ./apps/mcp-server
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/shared build
RUN pnpm --filter @citadelmd/mcp-server build

FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY --from=build /app/ ./
WORKDIR /app/apps/mcp-server
# Run as non-root uid 1000 (matches host user sp) so document files stay host-writable
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV GIT_REPO_PATH=/data/docs
EXPOSE 3100
CMD ["node", "dist/index.js"]
