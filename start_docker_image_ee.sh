#!/bin/bash

# N8N Docker Run Script with OIDC Support (Enterprise Edition)
# Updated: $(date +"%Y-%m-%d")

set -e

CONTAINER_NAME="n8n-ee"
IMAGE_NAME="n8nio/n8n:latest"
PORT=${N8N_PORT:-5678}

echo "🚀 Starting N8N Enterprise Edition with OIDC support..."

# Stop and remove any existing container
echo "🛑 Stopping existing containers..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Create data volume if it doesn't exist
docker volume create n8n-ee-data 2>/dev/null || true

echo "🔧 Starting N8N container (Enterprise Edition)..."
docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:5678 \
  -e N8N_PORT=5678 \
  -e N8N_LOG_LEVEL=info \
  -e N8N_SSO_OIDC_ENABLED=true \
  -e N8N_OIDC_CLIENT_ID=${N8N_OIDC_CLIENT_ID} \
  -e N8N_OIDC_CLIENT_SECRET=${N8N_OIDC_CLIENT_SECRET} \
  -e N8N_OIDC_ISSUER_URL=https://login.microsoftonline.com/0ae51e19-07c8-4e4b-bb6d-648ee58410f4/v2.0/ \
  -e N8N_OIDC_REDIRECT_URL=http://localhost:$PORT/rest/sso/oidc/callback \
  -e N8N_OIDC_SCOPES="openid email profile" \
  -e N8N_OIDC_JIT_PROVISIONING=true \
  -e N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false \
  -v n8n-ee-data:/home/node/.n8n \
  --restart unless-stopped \
  $IMAGE_NAME

echo "✅ N8N Enterprise Edition container started successfully!"
echo "🌐 Access N8N at: http://localhost:$PORT"
echo "📋 Container name: $CONTAINER_NAME"
echo "⚠️  Note: OIDC/SSO requires Enterprise Edition license"
echo ""
echo "📊 Container status:"
docker ps --filter name=$CONTAINER_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "📝 To view logs: docker logs -f $CONTAINER_NAME"
echo "🛑 To stop: docker stop $CONTAINER_NAME"
