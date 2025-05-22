# OIDC SSO Setup Guide

This guide walks through setting up OpenID Connect (OIDC) SSO for n8n, including configuring your identity provider and adding a login button to the n8n interface.

## Step 1: Install Required Package

Make sure the `openid-client` package is installed:

```bash
cd /Users/gop1fe/n8n.io/n8n
pnpm add openid-client
```

## Step 2: Configure Your Identity Provider

### Auth0 Example

1. Create a new application in Auth0
2. Set the application type to "Regular Web Application"
3. Configure the following URLs:
   - Allowed Callback URLs: `http://localhost:5678/sso/oidc/callback` (development) or `https://your-n8n-domain/sso/oidc/callback` (production)
   - Allowed Logout URLs: `http://localhost:5678/signin` (development) or `https://your-n8n-domain/signin` (production)
4. Note down the Client ID, Client Secret, and Domain

### Other Providers

For other OIDC providers (Okta, Keycloak, etc.), follow their documentation to create an OIDC application and configure redirect URIs.

## Step 3: Configure n8n Environment Variables

Add the following to your environment variables:

```bash
# Required settings
N8N_SSO_OIDC_ENABLED=true
N8N_OIDC_ISSUER_URL=https://your-tenant.auth0.com/.well-known/openid-configuration
N8N_OIDC_CLIENT_ID=your-client-id
N8N_OIDC_CLIENT_SECRET=your-client-secret
N8N_OIDC_REDIRECT_URL=http://localhost:5678/sso/oidc/callback

# Optional settings
N8N_OIDC_SCOPES="openid email profile"
N8N_OIDC_JIT_PROVISIONING=true
N8N_OIDC_REDIRECT_LOGIN_TO_SSO=false
```

## Step 4: Test Basic Authentication Flow

1. Start your n8n instance: `npm start`
2. Navigate to: `http://localhost:5678/sso/oidc/login`
3. You should be redirected to your identity provider
4. After authentication, you should be redirected back to n8n and logged in

## Step 5: Add SSO Login Button to Frontend (Optional)

To add a login button to the n8n login page:

1. Modify the Login.vue component:

```bash
nano /Users/gop1fe/n8n.io/n8n/packages/editor-ui/src/components/auth/Login.vue
```

2. Add an SSO login button by adding this code before the closing `</div>` of the form:

```vue
<div class="sso-login-container">
  <n8n-divider>Or</n8n-divider>
  <n8n-button
    :label="'Login with SSO'"
    size="large"
    block
    @click="redirectToSsoLogin"
  />
</div>
```

3. Add the redirectToSsoLogin method to the component's methods:

```javascript
redirectToSsoLogin() {
  window.location.href = '/sso/oidc/login';
},
```

4. Add some basic styling to the component's style section:

```css
.sso-login-container {
  margin-top: 20px;
}
```

5. Rebuild the frontend:

```bash
cd /Users/gop1fe/n8n.io/n8n
pnpm build
```

## Step 6: Testing

1. Restart your n8n instance
2. Navigate to the login page (`http://localhost:5678/signin`)
3. You should now see an "Login with SSO" button
4. Clicking it should start the OIDC authentication flow

## Troubleshooting

### No SSO Login Button

If you implemented the frontend changes but don't see the SSO button:
- Ensure you rebuilt the frontend with `pnpm build`
- Check browser console for any errors
- Verify that you modified the correct Login.vue file

### Authentication Errors

If you're encountering errors during authentication:
- Check n8n logs with `N8N_LOG_LEVEL=debug` enabled
- Verify that all environment variables are set correctly
- Ensure the callback URL is configured correctly in your identity provider

### User Creation Issues

If users aren't being created automatically:
- Ensure `N8N_OIDC_JIT_PROVISIONING=true` is set
- Check that your identity provider is sending the required claims (email, name)
- Review the logs for any specific error messages

## Next Steps

- Set up role mapping based on identity provider groups/claims
- Configure automatic workspace assignment
- Set up multi-tenant support if needed
