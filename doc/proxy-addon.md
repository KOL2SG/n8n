# n8n Proxy Extension

## Overview

The n8n proxy extension is an implementation that uses the `global-agent` package to enable HTTP/HTTPS proxy support throughout the application, with particular emphasis on supporting HTTP CONNECT for HTTPS connections. Additionally, it includes support for proxying requests made via `undici`, which is used by modern Node.js features like the native `fetch` API and **OIDC SSO authentication**.

## Why It Was Implemented

The proxy extension was implemented to address the need for comprehensive proxy support in n8n, particularly for:

1. **HTTP CONNECT Protocol Support**: Enabling secure HTTPS connections through proxy servers using the HTTP CONNECT protocol, which establishes a tunnel between the client and the destination server.

2. **Global Proxy Configuration**: Providing a unified way to configure proxy settings that apply across the entire n8n application rather than requiring configuration for individual components.

3. **Corporate Network Compatibility**: Supporting users who need to run n8n in corporate environments where all outbound traffic must pass through a proxy server.

4. **Support for Modern HTTP Clients**: Ensuring that both traditional Node.js HTTP/HTTPS modules and modern HTTP clients like `undici` (used by `fetch` API) respect proxy settings.

5. **OIDC SSO Support**: **Critical for OIDC authentication** - The `openid-client` library used by n8n's OIDC implementation relies on Node.js's modern `fetch` API (built on `undici`), which requires specific proxy configuration to work behind corporate proxies.

## Implementation Details

The proxy extension consists of two main components:

### 1. Global-Agent Bootstrap (Traditional HTTP/HTTPS)

Implemented in the `bootstrap-proxy.ts` file in the CLI package. It uses the `global-agent` package to intercept HTTP/HTTPS requests and route them through the configured proxy.

```typescript
// From bootstrap-proxy.ts
console.log('[bootstrap-proxy] interceptor loaded');
import 'global-agent/bootstrap';

console.error(
	'[bootstrap-proxy] env HTTP_PROXY=',
	process.env.HTTP_PROXY,
	'HTTPS_PROXY=',
	process.env.HTTPS_PROXY,
	'GLOBAL_AGENT.HTTP_PROXY=',
	(global as any).GLOBAL_AGENT?.HTTP_PROXY,
);
```

### 2. Undici Bootstrap (Modern Fetch API) 

**This component is essential for OIDC SSO authentication to work behind proxies.**

Implemented in the `bootstrap-undici-proxy.ts` file to support proxying for the modern `fetch` API and libraries that use `undici` under the hood (like `openid-client` used by OIDC authentication).

```typescript
// From bootstrap-undici-proxy.ts
console.log('[bootstrap-undici-proxy] initializing...');

import { ProxyAgent } from 'undici';
import { setGlobalDispatcher } from 'undici';

const proxyUrl = 
    process.env.GLOBAL_AGENT_HTTP_PROXY || 
    (global as any).GLOBAL_AGENT?.HTTP_PROXY || 
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy;

if (proxyUrl) {
    console.log(`[bootstrap-undici-proxy] configuring undici with proxy: ${proxyUrl}`);
    
    const proxyAgent = new ProxyAgent({
        uri: proxyUrl,
        // Allow self-signed certificates in development
        ...(process.env.NODE_ENV === 'development' ? { 
            requestTls: { rejectUnauthorized: false },
            proxy: { rejectUnauthorized: false }
        } : {})
    });
    
    setGlobalDispatcher(proxyAgent);
}
```

**Why Undici Bootstrap is Critical for OIDC:**
- The OIDC implementation uses the `openid-client` library
- `openid-client` uses Node.js's native `fetch` API internally
- `fetch` is built on the `undici` HTTP client
- Unlike traditional Node.js HTTP modules, `undici` doesn't automatically use `global-agent` proxy settings
- Without the undici bootstrap, OIDC provider discovery and token exchange will fail behind proxies

## OIDC-Specific Proxy Configuration 

### Overview

To ensure seamless OIDC SSO authentication behind corporate proxies, it's crucial to configure the proxy settings correctly. **OIDC authentication will fail without proper proxy configuration** because the `openid-client` library relies on `undici`/`fetch` which doesn't automatically inherit traditional Node.js proxy settings.

### Required Environment Variables for OIDC

For OIDC SSO to work behind proxies, the following environment variables must be set:

```bash
# Primary proxy configuration (REQUIRED for OIDC)
GLOBAL_AGENT_HTTP_PROXY=http://proxy-server:port
GLOBAL_AGENT_HTTPS_PROXY=http://proxy-server:port  # Can be same as HTTP_PROXY

# Bypass proxy for local/internal hosts
GLOBAL_AGENT_NO_PROXY=localhost,127.0.0.1,.internal.company.com

# OIDC Configuration (in addition to proxy settings)
N8N_SSO_OIDC_ENABLED=true
N8N_OIDC_ISSUER_URL=https://your-identity-provider.com
N8N_OIDC_CLIENT_ID=your-client-id
N8N_OIDC_CLIENT_SECRET=your-client-secret
N8N_OIDC_REDIRECT_URI=https://your-n8n-host/rest/sso/oidc/callback

# Optional: Enable automatic redirect to OIDC when users visit root URL
N8N_OIDC_REDIRECT_LOGIN_TO_SSO=true
```

### Critical Startup Command for OIDC + Proxy

**IMPORTANT**: Both proxy bootstrap files must be loaded for OIDC to work behind proxies:

```bash
# Standard startup with proxy support for OIDC
node -r ./packages/cli/build/bootstrap-proxy.js -r ./packages/cli/build/bootstrap-undici-proxy.js n8n
```

### Docker Configuration for OIDC + Proxy

```yaml
version: '3'
services:
  n8n:
    image: n8nio/n8n
    environment:
      # Proxy Configuration (CRITICAL for OIDC)
      - GLOBAL_AGENT_HTTP_PROXY=http://proxy-server:port
      - GLOBAL_AGENT_HTTPS_PROXY=http://proxy-server:port
      - GLOBAL_AGENT_NO_PROXY=localhost,127.0.0.1
      
      # OIDC Configuration
      - N8N_SSO_OIDC_ENABLED=true
      - N8N_OIDC_ISSUER_URL=https://your-identity-provider.com
      - N8N_OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - N8N_OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
      - N8N_OIDC_REDIRECT_URI=https://your-n8n-host/rest/sso/oidc/callback
      - N8N_OIDC_REDIRECT_LOGIN_TO_SSO=true  # Optional: Auto-redirect to OIDC
    
    # REQUIRED: Load both proxy bootstraps for OIDC
    command: node -r ./packages/cli/build/bootstrap-proxy.js -r ./packages/cli/build/bootstrap-undici-proxy.js n8n
    
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

### OIDC Proxy Troubleshooting Guide

#### 1. OIDC Discovery Errors
**Symptom**: `OIDC discovery error` or `fetch failed` during startup

**Solutions**:
```bash
# Test provider accessibility manually
curl -x http://proxy-server:port https://your-issuer/.well-known/openid-configuration

# Verify both bootstrap files are loaded (check startup logs)
# Should see both:
[bootstrap-proxy] interceptor loaded
[bootstrap-undici-proxy] configuring undici with proxy: http://proxy-server:port
```

#### 2. Token Exchange Failures
**Symptom**: Authentication starts but fails during callback processing

**Solutions**:
- Verify `GLOBAL_AGENT_HTTP_PROXY` is accessible from n8n server
- Check that identity provider endpoints are not in `GLOBAL_AGENT_NO_PROXY`
- Ensure proxy allows HTTPS CONNECT for token endpoints

#### 3. Certificate Issues Behind Corporate Proxies
**Symptom**: SSL/TLS errors during OIDC communication

**Solutions**:
```bash
# For development/testing only
NODE_ENV=development  # Enables certificate bypass in undici bootstrap

# For production, add corporate CA certificates
NODE_EXTRA_CA_CERTS=/path/to/corporate-ca-bundle.pem
```

#### 4. Debugging OIDC Proxy Issues

Enable detailed logging:
```bash
# Enable debug logs for OIDC and proxy
DEBUG=* n8n
# Or more specific:
DEBUG=n8n:oidc,global-agent n8n
```

Check startup logs for these key messages:
```
[bootstrap-proxy] interceptor loaded
[bootstrap-undici-proxy] configuring undici with proxy: http://proxy-server:port
OIDC environment variables: {"ssoOidcEnabled":"true",...}
OIDC SSO (Community Edition) initialized successfully
```

### Testing OIDC Proxy Configuration

1. **Test Basic Connectivity**:
```bash
# From inside n8n container/environment
curl -x http://proxy-server:port https://your-issuer/.well-known/openid-configuration
```

2. **Test OIDC Flow**:
   - Navigate to n8n login page
   - Verify "Sign in with OIDC" button appears
   - Click button and verify redirect to identity provider
   - Complete authentication and verify successful callback

3. **Monitor Logs**:
   - Watch for proxy-related startup messages
   - Monitor OIDC initialization logs
   - Check for any fetch/network errors during authentication

### Common OIDC + Proxy Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `fetch failed` | `undici` can't reach OIDC provider | Verify `GLOBAL_AGENT_HTTP_PROXY` and undici bootstrap |
| `OIDC discovery error` | Provider metadata unreachable | Check proxy allows access to `/.well-known/openid-configuration` |
| `TypeError: fetch failed` | Undici proxy not configured | Ensure both bootstrap files are loaded |
| `ECONNREFUSED` | Proxy server unreachable | Verify proxy URL and network connectivity |

## How to Use

To use the proxy extension, set the appropriate environment variables before starting n8n:

```bash
# For HTTP and HTTPS proxy (global-agent specific variable)
export GLOBAL_AGENT_HTTP_PROXY=http://proxy-server:port
export GLOBAL_AGENT_HTTPS_PROXY=http://proxy-server:port

# If authentication is required
export GLOBAL_AGENT_HTTP_PROXY=http://username:password@proxy-server:port
export GLOBAL_AGENT_HTTPS_PROXY=http://username:password@proxy-server:port

# To bypass the proxy for specific hosts
export GLOBAL_AGENT_NO_PROXY=localhost,127.0.0.1,.example.com

# Then start n8n with the proxy extension enabled
node -r ./packages/cli/build/bootstrap-proxy.js -r ./packages/cli/build/bootstrap-undici-proxy.js n8n
```

**Important Note**: Testing has shown that in the n8n implementation, only the `GLOBAL_AGENT_` prefixed variables are reliably recognized. Always use the `GLOBAL_AGENT_` prefixed variables for consistent behavior.

## Benefits

1. **Transparent Proxying**: All HTTP/HTTPS requests made by n8n will automatically go through the configured proxy without requiring changes to individual components.

2. **HTTPS Support**: The extension properly handles HTTPS connections through the proxy using the HTTP CONNECT protocol, which establishes a tunnel for secure communication.

3. **Authentication Support**: Proxy servers requiring authentication are supported through the standard proxy URL format.

4. **Comprehensive Coverage**: The dual-bootstrap approach ensures that both traditional Node.js HTTP modules and modern fetch-based libraries use the proxy correctly.

## Technical Details

### HTTP CONNECT Protocol

The HTTP CONNECT method is used to establish a tunnel between the client and the destination server through a proxy. This is particularly important for HTTPS connections, as it allows the client to establish an end-to-end encrypted connection with the destination server, with the proxy simply relaying encrypted data without being able to inspect it.

The `global-agent` package handles the implementation details of the HTTP CONNECT protocol, making it transparent to the n8n application code.

### Environment Variables

Based on testing and implementation, the proxy extension in n8n only reliably recognizes the following environment variables:

- `GLOBAL_AGENT_HTTP_PROXY`: URL of the proxy server to use for both HTTP and HTTPS requests
- `GLOBAL_AGENT_NO_PROXY`: Comma-separated list of hosts that should bypass the proxy

## Integration with n8n

The proxy extension is designed to be loaded at the very beginning of the n8n application startup process using Node.js's `-r` (or `--require`) flag, which preloads the specified module before any other code runs. This ensures that all HTTP/HTTPS requests made by n8n, including those during the initialization phase, are properly routed through the configured proxy.

## Docker Deployment

When using n8n in a Docker container, you can set the environment variables in your docker-compose.yml file or when running the container:

```yaml
version: '3'
services:
  n8n:
    image: n8nio/n8n
    environment:
      - GLOBAL_AGENT_HTTP_PROXY=http://proxy-server:port
      - GLOBAL_AGENT_HTTPS_PROXY=http://proxy-server:port
      - GLOBAL_AGENT_NO_PROXY=localhost,127.0.0.1
    command: node -r ./packages/cli/build/bootstrap-proxy.js -r ./packages/cli/build/bootstrap-undici-proxy.js n8n
```

## Troubleshooting

If you're experiencing issues with the proxy extension:

1. **Verify Environment Variables**: Ensure that you're using the `GLOBAL_AGENT_` prefixed variables and that they're correctly set.

2. **Check Proxy URL Format**: The proxy URL should be in the format `http://[username:password@]host:port`.

3. **Debug Logs**: Both bootstrap files log the proxy configuration at startup. Check these logs to verify that the proxy settings are being correctly loaded.

4. **Test Connection**: You can test if the proxy is working by making a simple HTTP request from within n8n to an external service.

## Limitations

1. **HTTPS Only**: The HTTP CONNECT protocol is primarily used for HTTPS connections. HTTP connections will still use the proxy but without the tunneling mechanism.

2. **WebSocket Support**: WebSocket connections may not be properly proxied in all cases, as the global-agent package primarily focuses on HTTP/HTTPS requests.

3. **Custom HTTP Clients**: If a node or component in n8n uses a custom HTTP client that doesn't use Node.js's built-in HTTP/HTTPS modules or undici, it may bypass the proxy configuration. Specifically, the `got` HTTP client is not currently patched and may not respect proxy settings.

4. **Undici Version Requirements**: The undici proxy support requires Node.js 16.5.0 or later, which supports the ProxyAgent feature in undici.

## Security Considerations

When using a proxy with authentication, be aware that:

1. The proxy credentials are stored in environment variables, which might be accessible to other processes on the same system.

2. If you're using a proxy in a shared environment, consider using a dedicated proxy user with limited permissions.

3. For maximum security, use HTTPS for the proxy connection itself when possible, although this is not commonly supported by proxy servers.

## Future Improvements

Potential future improvements to the proxy extension could include:

1. Better integration with n8n's configuration system, allowing proxy settings to be configured through the UI or config files.

2. Enhanced logging and diagnostics for proxy-related issues.

3. Support for more advanced proxy features, such as proxy authentication methods beyond basic auth.

4. Adding proxy support for the `got` HTTP client, which is used in some n8n nodes.
