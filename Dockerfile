# ── TeamGPT image ──────────────────────────────────────
# Small, production-oriented Node image. No build step is needed (plain ESM),
# so we just install production dependencies and copy the source.
FROM node:22-alpine

# Run as an unprivileged user (the base image ships a "node" user).
ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source.
COPY src ./src
COPY public ./public

# Durable data directory (users, sessions, conversations, usage), owned by the
# runtime user so a mounted named volume inherits the right ownership.
RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 4000

# Liveness probe hits the unauthenticated /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
