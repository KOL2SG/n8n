# n8n OIDC Development Docker Image

This Docker image is specifically designed for developing and testing OIDC (OpenID Connect) authentication with n8n. It extends the base n8n functionality with debugging tools and OIDC-specific configurations.

## Features

- **Full n8n functionality** with OIDC support
- **Debug tools** for network troubleshooting (curl, wget, nmap, tcpdump, etc.)
- **OIDC pre-configuration** with environment variables
- **Health checks** for monitoring
- **Development optimized** with debug logging enabled

## Building the Image

From the repository root:

```bash
# Build using the existing n8n build system
pnpm build:docker

# Or build manually
docker build -f docker/images/n8n-oidc/Dockerfile -t n8n-oidc:latest .
```

## Running the Container

### Basic Usage

```bash
docker run -d \
  --name n8n-oidc \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8n-oidc:latest
```

### With OIDC Configuration

```bash
docker run -d \
  --name n8n-oidc \
  -p 5678:5678 \
  -e N8N_SSO_OIDC_ENABLED=true \
  -e N8N_OIDC_ISSUER_URL=https://your-oidc-provider.com \
  -e N8N_OIDC_CLIENT_ID=your-client-id \
  -e N8N_OIDC_CLIENT_SECRET=your-client-secret \
  -e N8N_OIDC_REDIRECT_URL=http://localhost:5678/rest/sso/oidc/callback \
  -v n8n_data:/home/node/.n8n \
  n8n-oidc:latest
```

## Environment Variables

### OIDC Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_SSO_OIDC_ENABLED` | `false` | Enable OIDC authentication |
| `N8N_OIDC_ISSUER_URL` | - | OIDC provider issuer URL |
| `N8N_OIDC_CLIENT_ID` | - | OIDC client ID |
| `N8N_OIDC_CLIENT_SECRET` | - | OIDC client secret |
| `N8N_OIDC_REDIRECT_URL` | - | Callback URL for OIDC |
| `N8N_OIDC_SCOPES` | `"openid email profile"` | OIDC scopes |
| `N8N_OIDC_JIT_PROVISIONING` | `true` | Enable just-in-time user provisioning |
| `N8N_OIDC_REDIRECT_LOGIN_TO_SSO` | `false` | Redirect login page to SSO |

### Debug Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_LOG_LEVEL` | `debug` | Logging level for troubleshooting |

## OIDC Endpoints

Once running, the following OIDC endpoints are available:

- **Login**: `http://localhost:5678/rest/sso/oidc/login`
- **Callback**: `http://localhost:5678/rest/sso/oidc/callback`

## Supported OIDC Providers

This image supports any OIDC-compliant provider, including:

- **Google OAuth2**
- **Microsoft Azure AD**
- **Keycloak**
- **Auth0**
- **Okta**
- **Custom OIDC providers**

## Debugging

The image includes various debugging tools:

```bash
# Access container shell
docker exec -it n8n-oidc /bin/sh

# Check network connectivity
docker exec n8n-oidc curl -v https://your-oidc-provider.com/.well-known/openid_configuration

# View logs
docker logs -f n8n-oidc

# Monitor network traffic
docker exec n8n-oidc tcpdump -i eth0 -n
```

## Health Check

The container includes a health check that monitors the n8n service:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' n8n-oidc
```

## Example OIDC Provider Configurations

### Google OAuth2

```bash
N8N_OIDC_ISSUER_URL=https://accounts.google.com
N8N_OIDC_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
N8N_OIDC_CLIENT_SECRET=your-google-client-secret
```

### Azure AD

```bash
N8N_OIDC_ISSUER_URL=https://login.microsoftonline.com/your-tenant-id/v2.0
N8N_OIDC_CLIENT_ID=your-azure-app-id
N8N_OIDC_CLIENT_SECRET=your-azure-client-secret
```

### Keycloak

```bash
N8N_OIDC_ISSUER_URL=https://your-keycloak-server.com/realms/your-realm
N8N_OIDC_CLIENT_ID=your-keycloak-client-id
N8N_OIDC_CLIENT_SECRET=your-keycloak-client-secret
```

## Troubleshooting

1. **OIDC client not initialized**: Ensure all required environment variables are set
2. **Network connectivity**: Use the included debugging tools to test connectivity
3. **Certificate issues**: The image includes updated CA certificates
4. **Logs**: Enable debug logging with `N8N_LOG_LEVEL=debug`
