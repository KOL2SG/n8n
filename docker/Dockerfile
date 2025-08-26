ARG NODE_VERSION=22
ARG LAUNCHER_VERSION=1.1.3
ARG TARGETPLATFORM

# ==============================================================================
# STAGE 1: Build n8n from source with complete workspace dependencies
# ==============================================================================
FROM node:${NODE_VERSION}-alpine AS builder

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    jq \
    && ln -sf python3 /usr/bin/python

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Build the application from source
WORKDIR /src
COPY . /src

# ─── PREPARE TURBO CACHE DIRS ────────────────────────────────────────────────
# Avoid BuildKit overlayfs EINTR failures by creating all .turbo dirs up front
RUN mkdir -p /src/.turbo && \
    for pkg in /src/packages/* /src/packages/@*/*; do \
      mkdir -p "$pkg/.turbo"; \
    done && \
    chmod -R 777 /src

# Install dependencies with cache mounts for faster builds
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm/metadata \
    DOCKER_BUILD=true pnpm install --frozen-lockfile

# Build all packages
RUN TURBO_FORCE=true pnpm build

# Clean up for production deployment
RUN jq 'del(.pnpm.patchedDependencies)' package.json > package.json.tmp; mv package.json.tmp package.json
RUN node .github/scripts/trim-fe-packageJson.js

# Deploy the `n8n` package into /compiled with all workspace dependencies
RUN mkdir /compiled
RUN NODE_ENV=production DOCKER_BUILD=true pnpm --filter=n8n --prod --no-optional --legacy deploy /compiled

# ==============================================================================
# STAGE 2: Task Runner Launcher
# ==============================================================================
FROM alpine:3.22.0 AS launcher-downloader
ARG TARGETPLATFORM
ARG LAUNCHER_VERSION

RUN set -e; \
    case "$TARGETPLATFORM" in \
        "linux/amd64") ARCH_NAME="amd64" ;; \
        "linux/arm64") ARCH_NAME="arm64" ;; \
        *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac; \
    mkdir /launcher-temp && cd /launcher-temp; \
    wget -q "https://github.com/n8n-io/task-runner-launcher/releases/download/${LAUNCHER_VERSION}/task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz"; \
    wget -q "https://github.com/n8n-io/task-runner-launcher/releases/download/${LAUNCHER_VERSION}/task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz.sha256"; \
    echo "$(cat task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz.sha256) task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz" > checksum.sha256; \
    sha256sum -c checksum.sha256; \
    mkdir -p /launcher-bin; \
    tar xzf task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz -C /launcher-bin; \
    cd / && rm -rf /launcher-temp

# ==============================================================================
# STAGE 3: Final Runtime Image
# ==============================================================================
FROM n8nio/base:${NODE_VERSION} AS runtime

ARG N8N_RELEASE_TYPE=dev
ENV NODE_ENV=production
ENV N8N_RELEASE_TYPE=${N8N_RELEASE_TYPE}
ENV NODE_ICU_DATA=/usr/local/lib/node_modules/full-icu
ENV SHELL=/bin/sh

# Install essential runtime dependencies only
RUN apk add --no-cache \
    curl \
    wget \
    openssl \
    ca-certificates \
    jq

WORKDIR /home/node

# Copy built application from builder stage
COPY --from=builder /compiled /usr/local/lib/node_modules/n8n

# Copy task runner launcher
COPY --from=launcher-downloader /launcher-bin/* /usr/local/bin/

# Copy entrypoint and configuration files
COPY docker/images/n8n/docker-entrypoint.sh /
COPY docker/images/n8n/n8n-task-runners.json /etc/n8n-task-runners.json

# Setup n8n and rebuild native dependencies
RUN cd /usr/local/lib/node_modules/n8n && \
    npm rebuild sqlite3 && \
    ln -s /usr/local/lib/node_modules/n8n/bin/n8n /usr/local/bin/n8n && \
    mkdir -p /home/node/.n8n && \
    chown -R node:node /home/node

# Install npm@11.4.2 to fix brace-expansion vulnerability
RUN npm install -g npm@11.4.2

# Install canvas for PDF support
RUN cd /usr/local/lib/node_modules/n8n/node_modules/pdfjs-dist && npm install @napi-rs/canvas

# Environment variables
ENV N8N_USER_FOLDER=/home/node/.n8n
ENV N8N_HOST=0.0.0.0
ENV N8N_PORT=5678
ENV N8N_PROTOCOL=http
ENV N8N_LOG_LEVEL=info

# OIDC environment variables (disabled by default)
ENV N8N_SSO_OIDC_ENABLED=false
ENV N8N_OIDC_SCOPES="openid email profile"
ENV N8N_OIDC_JIT_PROVISIONING=true
ENV N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5678/healthz || exit 1

# Expose port
EXPOSE 5678/tcp

# Switch to non-root user
USER node

# Use tini as init system with custom entrypoint
ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]

# Labels
LABEL org.opencontainers.image.title="n8n Production" \
      org.opencontainers.image.description="n8n Workflow Automation with OIDC Support - Complete Dependencies" \
      org.opencontainers.image.source="https://github.com/n8n-io/n8n" \
      org.opencontainers.image.url="https://n8n.io" \
      org.opencontainers.image.vendor="n8n"
