#!/bin/bash

# Unified n8n Docker Build Script
# Supports multiple build types: production, development, oidc

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default values
IMAGE_NAME="n8n"
TAG="latest"
BUILD_TYPE="production"
DOCKERFILE="Dockerfile.unified"
RUN_CONTAINER=false
OIDC_ENABLED=false

# Usage function
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --tag TAG           Docker image tag (default: latest)"
    echo "  -n, --name NAME         Docker image name (default: n8n)"
    echo "  --type TYPE             Build type: production, development, oidc (default: production)"
    echo "  --run                   Run container after build"
    echo "  --oidc                  Enable OIDC configuration"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                      # Build production image"
    echo "  $0 --type oidc --run    # Build OIDC image and run"
    echo "  $0 -t dev --type development # Build development image"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        --type)
            BUILD_TYPE="$2"
            shift 2
            ;;
        --run)
            RUN_CONTAINER=true
            shift
            ;;
        --oidc)
            OIDC_ENABLED=true
            BUILD_TYPE="oidc"
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

# Set build-specific configurations
case $BUILD_TYPE in
    "oidc")
        OIDC_ENABLED=true
        TAG="${TAG}-oidc"
        FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"
        ;;
    "development")
        TAG="${TAG}-dev"
        FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"
        ;;
esac

print_status "Building n8n Docker image"
print_status "Image: ${FULL_IMAGE_NAME}"
print_status "Build type: ${BUILD_TYPE}"
print_status "OIDC enabled: ${OIDC_ENABLED}"

# Check Docker
if ! docker info &> /dev/null; then
    print_error "Docker is not running"
    exit 1
fi

# Build the image
print_status "Starting Docker build..."
if docker build -f "${DOCKERFILE}" -t "${FULL_IMAGE_NAME}" \
    --build-arg BUILD_TYPE="${BUILD_TYPE}" .; then
    
    print_success "Docker image built successfully: ${FULL_IMAGE_NAME}"
    
    # Show image info
    docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}"
    
    # Run container if requested
    if [[ "$RUN_CONTAINER" == true ]]; then
        print_status "Starting container..."
        
        # Stop existing container
        docker stop "${IMAGE_NAME}-container" 2>/dev/null || true
        docker rm "${IMAGE_NAME}-container" 2>/dev/null || true
        
        # Build docker run command
        RUN_CMD="docker run -d --name ${IMAGE_NAME}-container -p 5678:5678"
        
        if [[ "$OIDC_ENABLED" == true ]]; then
            RUN_CMD="$RUN_CMD \
                -e N8N_SSO_OIDC_ENABLED=true \
                -e N8N_LOG_LEVEL=debug"
            
            if [[ -f ".env" ]]; then
                RUN_CMD="$RUN_CMD --env-file .env"
            else
                print_warning "No .env file found. OIDC requires configuration:"
                echo "  N8N_OIDC_ISSUER_URL=https://your-provider.com"
                echo "  N8N_OIDC_CLIENT_ID=your-client-id"
                echo "  N8N_OIDC_CLIENT_SECRET=your-client-secret"
            fi
        fi
        
        RUN_CMD="$RUN_CMD -v n8n_data:/home/node/.n8n ${FULL_IMAGE_NAME}"
        
        eval $RUN_CMD
        
        print_success "Container started: ${IMAGE_NAME}-container"
        echo ""
        echo "🌐 Access n8n at: http://localhost:5678"
        if [[ "$OIDC_ENABLED" == true ]]; then
            echo "🔐 OIDC login: http://localhost:5678/rest/sso/oidc/login"
        fi
        echo ""
        print_status "Container logs:"
        docker logs -f "${IMAGE_NAME}-container"
    else
        echo ""
        print_status "To run the container:"
        echo "  docker run -d --name ${IMAGE_NAME}-container -p 5678:5678 -v n8n_data:/home/node/.n8n ${FULL_IMAGE_NAME}"
        if [[ "$OIDC_ENABLED" == true ]]; then
            echo ""
            print_status "For OIDC, add environment variables:"
            echo "  -e N8N_SSO_OIDC_ENABLED=true \\"
            echo "  -e N8N_OIDC_ISSUER_URL=https://your-provider.com \\"
            echo "  -e N8N_OIDC_CLIENT_ID=your-client-id \\"
            echo "  -e N8N_OIDC_CLIENT_SECRET=your-client-secret"
        fi
    fi
else
    print_error "Docker build failed!"
    exit 1
fi
