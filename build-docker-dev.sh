#!/bin/bash

# Simple Docker Build Script for Development
# Builds n8n directly from source using the development Dockerfile

set -e

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

# Default values
IMAGE_NAME="n8n-dev"
TAG="latest"
DOCKERFILE="Dockerfile.dev"

# Parse command line arguments
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
        --prod)
            DOCKERFILE="docker/images/n8n/Dockerfile"
            print_status "Using production Dockerfile"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -t, --tag TAG     Docker image tag (default: latest)"
            echo "  -n, --name NAME   Docker image name (default: n8n-dev)"
            echo "  --prod            Use production Dockerfile instead of dev"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Build n8n-dev:latest using dev Dockerfile"
            echo "  $0 -t v1.0.0               # Build n8n-dev:v1.0.0"
            echo "  $0 --prod -t production    # Build using production Dockerfile"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

FULL_IMAGE_NAME="${IMAGE_NAME}:${TAG}"

print_status "Building Docker image: ${FULL_IMAGE_NAME}"
print_status "Using Dockerfile: ${DOCKERFILE}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "${DOCKERFILE}" ]; then
    print_error "Dockerfile not found: ${DOCKERFILE}"
    exit 1
fi

# Build the Docker image
print_status "Starting Docker build..."
echo ""

if docker build -f "${DOCKERFILE}" -t "${FULL_IMAGE_NAME}" .; then
    print_success "Docker image built successfully: ${FULL_IMAGE_NAME}"
    echo ""
    
    # Show image info
    print_status "Image details:"
    docker images "${IMAGE_NAME}" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedSince}}"
    echo ""
    
    print_status "To run the container:"
    echo ""
    echo "  # Basic run:"
    echo "  docker run -d --name n8n-container -p 5678:5678 ${FULL_IMAGE_NAME}"
    echo ""
    echo "  # With OIDC configuration:"
    echo "  docker run -d --name n8n-container -p 5678:5678 \\"
    echo "    -e N8N_SSO_OIDC_ENABLED=true \\"
    echo "    -e N8N_OIDC_ISSUER_URL=https://your-provider.com \\"
    echo "    -e N8N_OIDC_CLIENT_ID=your-client-id \\"
    echo "    -e N8N_OIDC_CLIENT_SECRET=your-client-secret \\"
    echo "    -e N8N_OIDC_REDIRECT_URL=http://localhost:5678/rest/sso/oidc/callback \\"
    echo "    -v n8n_data:/home/node/.n8n \\"
    echo "    ${FULL_IMAGE_NAME}"
    echo ""
    echo "  # Using docker-compose:"
    echo "  docker-compose -f docker-compose.dev.yml up -d"
    echo ""
    
else
    print_error "Docker build failed!"
    exit 1
fi
