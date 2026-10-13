# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @medicare/api --include-workspace-root

COPY tsconfig.json* ./
COPY apps/api apps/api
RUN npm --workspace @medicare/api run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @medicare/api --include-workspace-root \
 && npm cache clean --force

COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/apps/api/scripts apps/api/scripts
COPY db db

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
