#!/bin/bash

# Set OIDC environment variables
export N8N_SSO_OIDC_ENABLED=true
export N8N_OIDC_CLIENT_ID=${N8N_OIDC_CLIENT_ID:-"your-client-id-here"}
export N8N_OIDC_CLIENT_SECRET=${N8N_OIDC_CLIENT_SECRET:-"your-client-secret-here"}
export N8N_OIDC_ISSUER_URL=https://login.microsoftonline.com/0ae51e19-07c8-4e4b-bb6d-648ee58410f4/v2.0/
export N8N_OIDC_JIT_PROVISIONING=true
export N8N_OIDC_REDIRECT_URL=http://localhost:5678/rest/sso/oidc/callback

# Start n8n
cd packages/cli/bin && ./n8n
