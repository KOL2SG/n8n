#!/bin/bash

# OpenShift Deployment Script for n8n with OIDC

set -e

echo "🚀 Deploying n8n with OIDC to OpenShift..."

# Step 1: Build and tag the Docker image
echo "📦 Building Docker image..."
docker build -f Dockerfile.unified -t n8n-oidc:latest .

# Step 2: Tag for OpenShift registry (update with your registry)
echo "🏷️  Tagging image for OpenShift registry..."
# Replace with your actual OpenShift registry URL
REGISTRY_URL="your-openshift-registry.com/your-project"
docker tag n8n-oidc:latest ${REGISTRY_URL}/n8n-oidc:latest

# Step 3: Push to OpenShift registry
echo "📤 Pushing image to OpenShift registry..."
# docker push ${REGISTRY_URL}/n8n-oidc:latest

# Step 4: Update deployment YAML with correct image
echo "📝 Updating deployment YAML..."
sed -i "s|your-registry/n8n-oidc:latest|${REGISTRY_URL}/n8n-oidc:latest|g" openshift-deploy.yaml

# Step 5: Get OpenShift route and update redirect URL
echo "🌐 Getting OpenShift route..."
# Uncomment and modify based on your OpenShift setup
# ROUTE_URL=$(oc get route n8n-oidc-route -o jsonpath='{.spec.host}' 2>/dev/null || echo "your-openshift-route.apps.cluster.com")
# sed -i "s|https://your-openshift-route|https://${ROUTE_URL}|g" openshift-deploy.yaml

echo "⚠️  MANUAL STEPS REQUIRED:"
echo "1. Update the image registry URL in openshift-deploy.yaml"
echo "2. Update the OpenShift route URLs in the deployment"
echo "3. Push the Docker image to your registry"
echo "4. Apply the deployment:"
echo "   oc apply -f openshift-deploy.yaml"

echo ""
echo "📋 Next steps:"
echo "1. docker push ${REGISTRY_URL}/n8n-oidc:latest"
echo "2. Update openshift-deploy.yaml with your actual route URL"
echo "3. oc apply -f openshift-deploy.yaml"
echo "4. oc get route n8n-oidc-route"
