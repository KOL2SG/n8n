#!/bin/bash

# Build n8n OIDC Docker Image Script
# This script builds n8n with OIDC support using a simplified approach

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Building n8n OIDC Docker image..."

# Create a temporary Dockerfile that builds from the official n8n image
cat > Dockerfile.temp << 'EOF'
FROM n8nio/n8n:latest

# Switch to root to install packages
USER root

# Install debugging and networking tools
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

# OIDC-specific environment variables with defaults
ENV N8N_SSO_OIDC_ENABLED=false
ENV N8N_OIDC_SCOPES="openid email profile"
ENV N8N_OIDC_JIT_PROVISIONING=true
ENV N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false
ENV N8N_LOG_LEVEL=debug

# Network and host configuration
ENV N8N_HOST=0.0.0.0
ENV N8N_PORT=5678
ENV N8N_PROTOCOL=http

# Health check for OIDC endpoints
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5678/healthz || wget --no-verbose --tries=1 --spider http://localhost:5678/healthz || exit 1

# Switch back to node user
USER node

# Labels for OIDC image
LABEL org.opencontainers.image.title="n8n OIDC Development" \
      org.opencontainers.image.description="n8n Workflow Automation with OIDC Support and Debug Tools" \
      org.opencontainers.image.source="https://github.com/n8n-io/n8n" \
      org.opencontainers.image.url="https://n8n.io" \
      org.opencontainers.image.vendor="n8n" \
      org.opencontainers.image.version="dev-oidc"
EOF

# Build the Docker image
print_status "Building Docker image..."
if docker build -f Dockerfile.temp -t n8n-oidc:latest .; then
    print_success "n8n OIDC Docker image built successfully!"
    
    # Clean up temporary Dockerfile
    rm -f Dockerfile.temp
    
    # Show image info
    print_status "Image details:"
    docker images n8n-oidc --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}"
    echo ""
    
    print_status "To run the container with OIDC:"
    echo ""
    echo "  docker run -d --name n8n-oidc -p 5678:5678 \\"
    echo "    -e N8N_SSO_OIDC_ENABLED=true \\"
    echo "    -e N8N_OIDC_ISSUER_URL=https://your-provider.com \\"
    echo "    -e N8N_OIDC_CLIENT_ID=your-client-id \\"
    echo "    -e N8N_OIDC_CLIENT_SECRET=your-client-secret \\"
    echo "    -e N8N_OIDC_REDIRECT_URL=http://localhost:5678/rest/sso/oidc/callback \\"
    echo "    -v n8n_data:/home/node/.n8n \\"
    echo "    n8n-oidc:latest"
    echo ""
    print_status "OIDC endpoints will be available at:"
    echo "  - Login: http://localhost:5678/rest/sso/oidc/login"
    echo "  - Callback: http://localhost:5678/rest/sso/oidc/callback"
    
else
    print_error "Docker build failed!"
    rm -f Dockerfile.temp
    exit 1
fi
