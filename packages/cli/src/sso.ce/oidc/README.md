# OpenID Connect (OIDC) Single Sign-On for n8n

This module implements OpenID Connect (OIDC) authentication for n8n Community Edition, allowing users to authenticate via any OIDC-compliant identity provider such as Auth0, Okta, Keycloak, Google, Microsoft Entra ID (formerly Azure AD), etc.

## Features

- **PKCE Authentication Flow** - Implements secure PKCE (Proof Key for Code Exchange) flow
- **Just-In-Time Provisioning** - Automatically creates user accounts when users authenticate for the first time
- **Feature Flag Protected** - Only activates when explicitly enabled
- **Dynamic ESM Module Loading** - Handles the ESM-only `openid-client` package properly
- **Type-Safe Implementation** - Complete TypeScript implementation with comprehensive error handling

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `N8N_SSO_OIDC_ENABLED` | Yes | `false` | Master feature flag to enable/disable OIDC |
| `N8N_OIDC_ISSUER_URL` | Yes | - | URL of the OIDC identity provider (discovery endpoint) |
| `N8N_OIDC_CLIENT_ID` | Yes | - | Client ID for your application registered with the identity provider |
| `N8N_OIDC_CLIENT_SECRET` | Yes | - | Client secret for your application |
| `N8N_OIDC_REDIRECT_URL` | Yes | - | Callback URL, typically `https://your-n8n-instance/sso/oidc/callback` |
| `N8N_OIDC_SCOPES` | No | `openid email profile` | Space-separated list of OAuth scopes to request |
| `N8N_OIDC_JIT_PROVISIONING` | No | `false` | Whether to automatically create users on first login |
| `N8N_OIDC_REDIRECT_LOGIN_TO_SSO` | No | `false` | Whether to automatically redirect the login page to SSO |

### Example Configuration

```env
# Required settings
N8N_SSO_OIDC_ENABLED=true
N8N_OIDC_ISSUER_URL=https://your-idp.example.com/.well-known/openid-configuration
N8N_OIDC_CLIENT_ID=your-client-id
N8N_OIDC_CLIENT_SECRET=your-client-secret
N8N_OIDC_REDIRECT_URL=https://your-n8n.example.com/sso/oidc/callback

# Optional settings
N8N_OIDC_SCOPES="openid email profile"
N8N_OIDC_JIT_PROVISIONING=true
N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false
```

## Usage

### Direct SSO Login

Navigate to the OIDC login endpoint:
```
https://your-n8n-instance/sso/oidc/login
```

This will redirect you to your identity provider for authentication.

### Frontend Integration

Currently, the n8n frontend does not display an SSO login button by default. You have several options:

1. **Direct Navigation**: Instruct users to visit the `/sso/oidc/login` URL directly
2. **Automatic Redirect**: Enable `N8N_OIDC_REDIRECT_LOGIN_TO_SSO=true` to automatically redirect users
3. **Custom Frontend**: Modify the n8n frontend to add an SSO login button (see below)

#### Adding an SSO Login Button (TODO)

To add an SSO login button to the n8n frontend, you'll need to modify the frontend code:

1. Modify the `/packages/editor-ui/src/components/auth/Login.vue` component
2. Add a button that redirects to `/sso/oidc/login`

## Troubleshooting

### Common Issues

1. **Configuration Problems**: Ensure all environment variables are set correctly
2. **Callback URL**: Make sure the callback URL is configured correctly in both n8n and your identity provider
3. **CORS Issues**: Some identity providers have strict CORS policies. Ensure your n8n domain is allowed
4. **Module Loading Errors**: If you encounter module loading errors, ensure you're using Node.js 14+ and have the latest version of n8n

### Debugging

Enable debug logging by setting:
```
N8N_LOG_LEVEL=debug
```

Then check your n8n logs for entries related to "OIDC" which will show detailed information about the authentication process.

## Security Considerations

- Always use HTTPS in production environments
- Keep your client secret secure
- Review the scopes requested from the identity provider
- Consider enabling JIT provisioning only if you trust your identity provider

## Test Identity Providers

The OIDC implementation has been tested with:
- Auth0
- Keycloak
- Okta
- Google
- Microsoft Entra ID (Azure AD)

## Support and Contributions

For issues or feature requests, please open an issue in the n8n repository.
