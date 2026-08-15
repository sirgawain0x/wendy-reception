# Wendy Edge — Dockerfile for NVIDIA Jetson Orin Nano Super
# Builds the edge runtime image for deployment to office appliances.

FROM node:20-slim AS base

WORKDIR /app

# Install system dependencies for Jetson
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --production || npm install --production

# Copy application code
COPY . .

# Build
RUN npm run build

# ─── Runtime stage ───────────────────────────────────────────────

FROM node:20-slim AS runtime

WORKDIR /app

# Copy built application
COPY --from=base /app ./

# Environment
ENV NODE_ENV=production
ENV WENDY_MODE=edge
ENV EDGE_MODEL_ENDPOINT=http://localhost:11434

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]