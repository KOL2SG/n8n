#!/bin/bash

# n8n Docker Build and Run Script
# This script builds a custom n8n Docker image from the current repository branch
# and runs it with OIDC configuration

set -e

echo "🚀 Building n8n Docker image from current branch..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp .env.example .env
    print_warning "Please edit .env file with your OIDC provider details before running the container!"
    echo ""
    echo "Required environment variables:"
    echo "  - N8N_OIDC_ISSUER_URL"
    echo "  - N8N_OIDC_CLIENT_ID" 
    echo "  - N8N_OIDC_CLIENT_SECRET"
    echo ""
    read -p "Press Enter to continue with the build (you can configure OIDC later)..."
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install pnpm first:"
    echo "npm install -g pnpm"
    exit 1
fi

# Check if docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Installing dependencies..."
pnpm install

print_status "Building n8n application..."
pnpm run build:deploy

print_status "Building Docker image..."
docker build -f docker/images/n8n/Dockerfile -t n8n-custom:latest .

print_success "Docker image built successfully!"

# Ask if user wants to run the container
echo ""
read -p "Do you want to run the container now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting n8n container..."
    
    # Stop existing container if running
    if docker ps -q -f name=n8n-dev | grep -q .; then
        print_status "Stopping existing n8n-dev container..."
        docker stop n8n-dev
        docker rm n8n-dev
    fi
    
    # Run with docker-compose if available, otherwise use docker run
    if [ -f docker-compose.dev.yml ]; then
        print_status "Using docker-compose to start services..."
        docker-compose -f docker-compose.dev.yml up -d
    else
        print_status "Running container with docker run..."
        docker run -d \
            --name n8n-dev \
            -p 5678:5678 \
            --env-file .env \
            -e N8N_HOST=0.0.0.0 \
            -e N8N_PORT=5678 \
            -e N8N_PROTOCOL=http \
            -e NODE_ENV=production \
            -e N8N_SSO_OIDC_ENABLED=true \
            -e N8N_OIDC_REDIRECT_URL=http://localhost:5678/rest/sso/oidc/callback \
            -e N8N_OIDC_SCOPES="openid email profile" \
            -e N8N_OIDC_JIT_PROVISIONING=true \
            -e N8N_LOG_LEVEL=debug \
            -v n8n_data:/home/node/.n8n \
            n8n-custom:latest
    fi
    
    print_success "n8n container is starting..."
    echo ""
    echo "🌐 Access n8n at: http://localhost:5678"
    echo "🔐 OIDC login at: http://localhost:5678/rest/sso/oidc/login"
    echo ""
    print_status "Container logs:"
    docker logs -f n8n-dev
else
    print_success "Docker image is ready! You can run it later with:"
    echo ""
    echo "  docker-compose -f docker-compose.dev.yml up -d"
    echo ""
    echo "Or manually with:"
    echo ""
    echo "  docker run -d --name n8n-dev -p 5678:5678 --env-file .env n8n-custom:latest"
fi
