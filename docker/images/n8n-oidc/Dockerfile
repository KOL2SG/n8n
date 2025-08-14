ARG NODE_VERSION=22

# 1. Create an image to build n8n with OIDC support
FROM n8nio/base:${NODE_VERSION} AS builder

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

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm/metadata \
    DOCKER_BUILD=true pnpm install --frozen-lockfile
RUN TURBO_FORCE=true pnpm build

# Delete all dev dependencies
RUN jq 'del(.pnpm.patchedDependencies)' package.json > package.json.tmp; mv package.json.tmp package.json
RUN node .github/scripts/trim-fe-packageJson.js

# Delete any source code, source-mapping, or typings
RUN find . -type f -name "*.ts" -o -name "*.js.map" -o -name "*.vue" -o -name "tsconfig.json" -o -name "*.tsbuildinfo" | xargs rm -rf

# Deploy the `n8n` package into /compiled
RUN mkdir /compiled
RUN NODE_ENV=production DOCKER_BUILD=true pnpm --filter=n8n --prod --no-optional --legacy deploy /compiled

# 2. Start with a new clean image with just the code that is needed to run n8n
FROM n8nio/base:${NODE_VERSION}
ENV NODE_ENV=production

ARG N8N_RELEASE_TYPE=dev
ENV N8N_RELEASE_TYPE=${N8N_RELEASE_TYPE}

WORKDIR /home/node
COPY --from=builder /compiled /usr/local/lib/node_modules/n8n
COPY docker/images/n8n/docker-entrypoint.sh /

# Install networking, debugging tools, and OIDC dependencies
RUN apk add --no-cache \
    curl \
    wget \
    iperf3 \
    bind-tools \
    traceroute \
    mtr \
    nmap \
    iproute2 \
    tcpdump \
    netcat-openbsd \
    busybox-extras \
    htop \
    jq \
    openssl \
    ca-certificates

# Setup the Task Runner Launcher
ARG TARGETPLATFORM
ARG LAUNCHER_VERSION=1.1.3
COPY docker/images/n8n/n8n-task-runners.json /etc/n8n-task-runners.json

# Download, verify, then extract the launcher binary
RUN \
	if [[ "$TARGETPLATFORM" = "linux/amd64" ]]; then export ARCH_NAME="amd64"; \
	elif [[ "$TARGETPLATFORM" = "linux/arm64" ]]; then export ARCH_NAME="arm64"; fi; \
    mkdir /launcher-temp && \
    cd /launcher-temp && \
	wget https://github.com/n8n-io/task-runner-launcher/releases/download/${LAUNCHER_VERSION}/task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz && \
	wget https://github.com/n8n-io/task-runner-launcher/releases/download/${LAUNCHER_VERSION}/task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz.sha256 && \
	# The .sha256 does not contain the filename --> Form the correct checksum file
	echo "$(cat task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz.sha256) task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz" > checksum.sha256 && \
	sha256sum -c checksum.sha256 && \
	tar xvf task-runner-launcher-${LAUNCHER_VERSION}-linux-${ARCH_NAME}.tar.gz --directory=/usr/local/bin && \
    cd - && \
	rm -r /launcher-temp

RUN \
	cd /usr/local/lib/node_modules/n8n && \
    npm rebuild sqlite3 && \
    cd - && \
    ln -s /usr/local/lib/node_modules/n8n/bin/n8n /usr/local/bin/n8n && \
    mkdir .n8n && \
    chown node:node .n8n

# OIDC-specific environment variables with defaults
ENV N8N_SSO_OIDC_ENABLED=false
ENV N8N_OIDC_SCOPES="openid email profile"
ENV N8N_OIDC_JIT_PROVISIONING=true
ENV N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false
ENV N8N_LOG_LEVEL=debug

# Health check for OIDC endpoints
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5678/healthz || exit 1

# Expose port
EXPOSE 5678

ENV SHELL=/bin/sh
USER node
ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]

# Labels for OIDC image
LABEL org.opencontainers.image.title="n8n OIDC Development" \
      org.opencontainers.image.description="n8n Workflow Automation with OIDC Support and Debug Tools" \
      org.opencontainers.image.source="https://github.com/n8n-io/n8n" \
      org.opencontainers.image.url="https://n8n.io" \
      org.opencontainers.image.vendor="n8n" \
      org.opencontainers.image.version="dev-oidc"
