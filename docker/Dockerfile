# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files and tsconfig
COPY package.json bun.lock ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client

# Clean stale build artifacts
RUN rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo

# Build shared
WORKDIR /app/packages/shared
RUN bun run build

# Build client
WORKDIR /app/packages/client
RUN bun run build



# Production stage
FROM oven/bun:1-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set environment variables for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/server ./packages/server
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Install production dependencies only
RUN bun install --production --frozen-lockfile

# Create temp directory for sessions
RUN mkdir -p /tmp/stepwise/sessions /tmp/stepwise/exports

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_DIR=/tmp/stepwise

WORKDIR /app/packages/server
CMD ["bun", "src/index.ts"]
