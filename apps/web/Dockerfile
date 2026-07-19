FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @citadelmd/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
