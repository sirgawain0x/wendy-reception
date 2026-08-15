# Wendy Central — Dockerfile for the central NVIDIA GPU server
# Runs the central inference gateway + model runtime.

FROM node:20-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --production || npm install --production

COPY . .
RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────

FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=base /app ./

ENV NODE_ENV=production
ENV WENDY_MODE=central

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

EXPOSE 8080

CMD ["npm", "start"]