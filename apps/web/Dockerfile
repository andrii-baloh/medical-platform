# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts packages/contracts
RUN npm ci --workspace @medicare/web --include-workspace-root
RUN mkdir -p apps/web/node_modules

# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY packages/contracts packages/contracts
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
COPY apps/api/package.json apps/api/
COPY packages/contracts packages/contracts
RUN npm ci --omit=dev --workspace @medicare/web --include-workspace-root \
 && npm cache clean --force
COPY --from=builder /repo/apps/web/.next apps/web/.next
# The TS config requires a compiler at runtime; use an equivalent JS config.
COPY infra/web/next.config.mjs apps/web/next.config.mjs
# igor.html is the landing-page source of truth.
COPY igor.html /repo/igor.html
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
