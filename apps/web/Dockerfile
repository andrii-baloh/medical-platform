# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @medicare/web --include-workspace-root

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --workspace @medicare/web run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @medicare/web --include-workspace-root \
 && npm cache clean --force
COPY --from=builder /repo/apps/web/.next apps/web/.next
COPY --from=builder /repo/apps/web/next.config.ts apps/web/next.config.ts
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
