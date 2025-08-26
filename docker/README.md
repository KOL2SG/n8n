# n8n Docker Build

This directory contains a single, consolidated Dockerfile that combines all the features from the multiple Docker images previously scattered across `/docker/images/`.

## Features

- **Complete Workspace Dependencies**: Builds from source with all workspace packages properly resolved
- **OIDC Support**: Built-in OpenID Connect configuration
- **Task Runner Support**: Includes task runner launcher for JavaScript execution
- **Production Optimized**: Multi-stage build with minimal runtime dependencies
- **Security**: Runs as non-root user with proper permissions

## Building

From the repository root:

```bash
# Build the image
docker build -f docker/Dockerfile -t n8n:latest .

# Build with specific Node version
docker build -f docker/Dockerfile --build-arg NODE_VERSION=22 -t n8n:latest .

# Build for specific platform
docker build -f docker/Dockerfile --platform linux/amd64 -t n8n:latest .
```

## Running

```bash
# Basic run
docker run -d -p 5678:5678 n8n:latest

# With OIDC enabled
docker run -d -p 5678:5678 \
  -e N8N_SSO_OIDC_ENABLED=true \
  -e N8N_OIDC_CLIENT_ID=your_client_id \
  -e N8N_OIDC_CLIENT_SECRET=your_client_secret \
  -e N8N_OIDC_ISSUER=https://your-oidc-provider.com \
  n8n:latest

# With persistent data
docker run -d -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8n:latest
```

## Environment Variables

### Core Settings
- `N8N_HOST=0.0.0.0` - Host to bind to
- `N8N_PORT=5678` - Port to listen on
- `N8N_PROTOCOL=http` - Protocol (http/https)
- `N8N_LOG_LEVEL=info` - Log level

### OIDC Settings
- `N8N_SSO_OIDC_ENABLED=false` - Enable OIDC authentication
- `N8N_OIDC_SCOPES="openid email profile"` - OIDC scopes
- `N8N_OIDC_JIT_PROVISIONING=true` - Just-in-time user provisioning
- `N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false` - Redirect login to SSO

## Build Arguments

- `NODE_VERSION=22` - Node.js version to use
- `LAUNCHER_VERSION=1.1.3` - Task runner launcher version
- `TARGETPLATFORM` - Target platform (linux/amd64, linux/arm64)
- `N8N_RELEASE_TYPE=dev` - Release type

## Consolidated Features

This single Dockerfile replaces the following previous images:
- `/docker/images/n8n/` - Base n8n image
- `/docker/images/n8n-oidc/` - OIDC-enabled image
- `/docker/images/n8n-custom/` - Custom build image
- `/docker/images/n8n-base/` - Base system image

All functionality is now available in one optimized build.
