# OpenID Connect (OIDC) SSO Extension for n8n

## Overview

This document outlines the architecture and implementation plan for extending n8n's authentication system to support OpenID Connect (OIDC) Single Sign-On (SSO). The proposal builds upon the existing authentication framework that currently supports email/password, LDAP, and SAML authentication methods.

## Current Authentication System

n8n currently supports the following authentication methods:

- **Email/Password**: Default authentication method
- **LDAP**: Enterprise authentication via LDAP directory
- **SAML 2.0**: Enterprise SSO via SAML protocol (requires license)

The system is designed to have only one active authentication method at a time, with special provisions for global owners to continue using email authentication regardless of the active method.

## OIDC Extension Design Goals

- Add `oidc` as a first-class authentication provider type
- Maintain the existing pattern of having only one active provider at a time
- Support "just-in-time" (JIT) user provisioning during SSO login
- Support unrestricted OIDC authentication (no license required)
- Reuse existing session management, MFA, telemetry, and analytics flows
- Allow global owners to fall back to email authentication when OIDC is active
- Avoid modifying existing LDAP/SAML code paths

## High-Level Architecture

                          ┌─────────────┐
    /login  ─────────────▶│Login screen │──────────────┐
                          └─────────────┘              │
   (email/pwd)                                       (401 & redirect)
                                                      │
                          ┌───────────────┐           ▼
        /sso/oidc/login──▶│ OIDCProvider  │  (302)  Identity
                          │  (auth code   │────────▶ Provider
                          │   + PKCE)     │           ▲
                          └───────────────┘           │
                                                      │  (302, code)
                          ┌────────────────┐          │
   /sso/oidc/callback────▶│ OidcService    │──────────┘
                          │  – verify code/token      │
                          │  – findOrCreateUser       │
                          └──────────────┬─┘
                                         │ issueCookie()
                                         ▼
                           existing `AuthService`

## Key Components

### 1. OidcService (Backend)

A new service that will:
- Use `openid-client` library to handle OIDC protocol flows
- Build authorization URLs for the `/sso/oidc/login` endpoint
- Exchange authorization codes for tokens at the `/sso/oidc/callback` endpoint
- Validate ID tokens and fetch additional user information if needed
- Map OIDC identity to n8n user accounts
- Create new users if JIT provisioning is enabled
- Emit the same authentication events as other auth methods

### 2. SSO Helper Extensions

Extend the existing `sso-helpers.ts` module with OIDC-specific functions:
- `isOidcCurrentAuthenticationMethod()`
- Update `setCurrentAuthenticationMethod()` to handle the `oidc` type

### 3. Configuration

All OIDC settings are managed via environment variables. No UI configuration is required.

```bash
# Enable OIDC SSO feature
N8N_SSO_OIDC_ENABLED=true

# OIDC provider configuration
N8N_OIDC_ISSUER_URL=https://your-identity-provider.com
N8N_OIDC_CLIENT_ID=your-client-id
N8N_OIDC_CLIENT_SECRET=your-client-secret
N8N_OIDC_REDIRECT_URL=https://{n8n-host}/sso/oidc/callback

# Optional settings with defaults
N8N_OIDC_SCOPES="openid email profile"  # Default: "openid email profile"
N8N_OIDC_JIT_PROVISIONING=true          # Default: true
N8N_OIDC_REDIRECT_LOGIN_TO_SSO=true     # Default: false
```

### 4. Database Schema Updates

Extend the user table with OIDC-specific fields:
- `oidcSubject`: Store the OIDC subject identifier (nullable)
- `oidcIssuer`: Store the issuer URL to handle multiple identity providers (nullable)

## Implementation Approach

Unlike SAML, the OIDC SSO feature is designed to be available to all n8n installations without requiring a license. This makes it more accessible while still providing enterprise-grade authentication capabilities.

### Key Implementation Differences from SAML

1. **No License Check**: The OIDC code path will not include license verification, in contrast to SAML which requires an enterprise license.
2. **Universal Availability**: The OIDC option will appear for all installations once the feature flag is enabled and the required environment variables are set.
3. **Unrestricted JIT Provisioning**: User provisioning will work without checking against license user limits, allowing organizations to onboard users through OIDC without friction.

### Technical Implementation Pattern

The implementation follows the NestJS modular approach with these components:

1. **Feature Flag**: All OIDC code is guarded by the `sso.oidcEnabled` feature flag but not license checks
2. **OidcService**: Core service handling token validation, user lookup, and provisioning 
3. **OidcController**: Routes for the OIDC auth flow
4. **Database Extensions**: Two new user fields (`oidcSubject` and `oidcIssuer`) for identity mapping

## Implementation Steps

### Backend Changes

1. Add `'oidc'` to the `AuthProviderType` enum in `@n8n/db`
2. Create database migration to add `oidcSubject` and `oidcIssuer` columns to the user table
3. Create a new `OidcService` class in `src/sso.ee/oidc.service.ts`
4. Extend `sso-helpers.ts` with OIDC-specific helper functions
5. Add new routes to `AuthController` or create a dedicated `OidcController`:
   - `/sso/oidc/login`
   - `/sso/oidc/callback`
6. Update the login method in `AuthController` to handle OIDC authentication
7. Implement JIT user provisioning for OIDC users without license checks

### Frontend Changes

1. Update the login view to show OIDC SSO option when configured
2. Add "Continue with SSO" button or auto-redirect based on settings
3. Create a loading/spinner page for the callback flow

## OpenShift Installation

To deploy n8n with OIDC SSO on OpenShift, create these resources:

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: n8n-oidc-config
data:
  OIDC_ISSUER_URL: "https://your-idp.com"
  OIDC_REDIRECT_URI: "https://<your-n8n-host>/sso/oidc/callback"
  OIDC_SCOPES: "openid email profile"
  OIDC_JIT_PROVISIONING: "true"
  OIDC_REDIRECT_LOGIN_TO_SSO: "true"

---
apiVersion: v1
kind: Secret
metadata:
  name: n8n-oidc-secret
type: Opaque
stringData:
  OIDC_CLIENT_ID: "your-client-id"
  OIDC_CLIENT_SECRET: "your-client-secret"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n
spec:
  replicas: 1
  selector:
    matchLabels:
      app: n8n
  template:
    metadata:
      labels:
        app: n8n
    spec:
      containers:
        - name: n8n
          image: n8n/n8n:latest
          envFrom:
            - configMapRef:
                name: n8n-oidc-config
            - secretRef:
                name: n8n-oidc-secret
          # ... other env / ports / volume mounts ...
```

Replace `<your-n8n-host>`, client ID/secret, and adjust resources as needed to match your environment.

## Security Considerations

- Always use Authorization Code flow with PKCE (even for confidential clients)
- Validate ID token signature against the issuer's JWKS
- Verify audience, issuer, and nonce claims in the ID token
- Enforce TLS for all OIDC endpoints
- Use secure, same-site cookies for session management
- Implement proper error handling for failed authentication attempts

## Testing Plan

1. Unit tests for the `OidcService` class
2. Integration tests for the OIDC authentication flow
3. End-to-end tests with mock OIDC providers

## Implementation Status

- [x] Core OIDC service and controller components
- [x] PKCE flow implementation for enhanced security
- [x] Feature flag protection via `N8N_SSO_OIDC_ENABLED`
- [x] JIT user provisioning based on OIDC claims
- [x] Login flow redirection to OIDC when enabled
- [x] Database schema updates for OIDC user mapping
- [x] Configuration options for controlling OIDC behavior
- [x] TypeScript type declarations and type-safe utilities
- [x] Code quality improvements and error handling
- [x] TypeScript build compatibility fixes
- [ ] Unit tests for OIDC components
- [ ] Integration tests with a mock OIDC provider

## Implementation Details

### TypeScript Type System Integration

1. **Type Declaration Files**

   Created declaration files to properly extend the TypeScript type system:

   ```typescript
   // /packages/cli/src/types/config.d.ts
   declare module '@n8n/config' {
     interface ConfigOptionPathMap {
       'sso.oidcEnabled': boolean;
       'oidc.issuerUrl': string;
       'oidc.clientId': string;
       'oidc.clientSecret': string;
       'oidc.redirectUri': string;
       'oidc.scopes': string;
       'oidc.jitProvisioning': boolean;
       'oidc.redirectLoginToSso': boolean;
     }
   }

   // /packages/cli/src/types/auth.d.ts
   declare module '@/auth/auth.service' {
     type AuthenticationMethod = 'email' | 'ldap' | 'saml' | 'oidc';
   }

   // Event payload types for auth events
   declare module '@/events/event.service' {
     interface EventPayloadLoginFailed {
       authenticationMethod: 'email' | 'ldap' | 'saml' | 'oidc';
       userEmail: string;
       reason: string;
     }
     
     interface EventPayloadLoggedIn {
       user: any;
       authenticationMethod: 'email' | 'ldap' | 'saml' | 'oidc';
     }
   }
   ```

2. **Type-Safe Config Helper Utilities**

   Created helper utilities to safely access configuration settings, eliminating type errors:

   ```typescript
   // /packages/cli/src/sso.cc/utils/config-helper.ts
   export function getOidcEnabled(): boolean {
     return Boolean(config.getEnv('sso.oidcEnabled' as any));
   }

   export function getOidcIssuerUrl(): string {
     return String(config.getEnv('oidc.issuerUrl' as any) || '');
   }
   // Other helper functions...
   ```

### Error Handling and Code Quality

1. **Comprehensive Error Logging**

   Implemented detailed error logging throughout the authentication flow:

   ```typescript
   try {
     // Token validation code
   } catch (error) {
     this.logger.error('OIDC authentication failed', { 
       error: error instanceof Error ? error.message : String(error),
       issuer: tokenClaims.iss,
       // Redacted sensitive information
     });
     throw new AuthError('Authentication failed');
   }
   ```

2. **Authentication Method Fixes**

   Fixed incorrect method usage for user authentication:
   
   ```typescript
   // Before: Incorrect parameter passing
   await this.authService.issueJWT(user, res); // Error: res is Response but string expected
   
   // After: Using the correct method
   this.authService.issueCookie(res, user); // Correct: Takes Response as first parameter
   ```
   
3. **Resource Cleanup**

   Added proper cleanup of sensitive data:
   
   ```typescript
   // Clear the PKCE verifier and nonce after use
   this.pkceVerifier = null;
   this.nonce = null;
   ```
   
4. **Type-Safe Query Handling**

   Improved request query handling for better type safety:
   
   ```typescript
   // Properly type the query parameters
   const queryParams = req.query as Record<string, string | string[]>;
   const tokenSet = await this.oidcService.handleCallback(queryParams);
   ```

## Installation and Configuration

### 1. Database Migration

The OIDC implementation requires database schema updates to add the following columns to the user table:
- `oidcSubject`: Store the OIDC subject identifier (nullable string)
- `oidcIssuer`: Store the issuer URL (nullable string)

These changes require a manual migration step. Here's how to run it:

```bash
# Run the migration command inside your n8n installation
n8n database:migrate

# For Docker installations
docker exec -it your-n8n-container n8n database:migrate
```

Alternatively, you can set the following environment variable to automatically run migrations at startup:

```bash
N8N_DB_MIGRATE_ON_STARTUP=true
```

### SQLite Compatibility

**Important**: If you're using SQLite as the database backend, you may encounter compatibility issues with the OIDC fields. The default migration may attempt to create the `oidcSubject` and `oidcIssuer` columns with a data type that SQLite doesn't support.

If you encounter an error like:
```
Data type "Object" in "User.oidcSubject" is not supported by "sqlite" database.
```

You'll need to manually fix your SQLite database schema:

1. Connect to your SQLite database file
2. Execute the following SQL statements:

```sql
-- Create a new user table with the correct field types
CREATE TABLE "user_new" AS SELECT * FROM "user";

-- Drop the old table
DROP TABLE "user";

-- Recreate the user table with correct column types
CREATE TABLE "user" (
    -- Copy all columns but specify TEXT for OIDC fields
    [id] TEXT PRIMARY KEY,
    [email] TEXT,
    -- Include all your other fields
    [oidcSubject] TEXT,
    [oidcIssuer] TEXT
    -- Include remaining fields
);

-- Copy data back
INSERT INTO "user" SELECT * FROM "user_new";

-- Drop the temporary table
DROP TABLE "user_new";

-- Recreate any necessary indexes
CREATE INDEX IF NOT EXISTS "IDX_user_oidcSubject" ON "user" ("oidcSubject");
```

Alternatively, consider using PostgreSQL or MySQL for production deployments with SSO features.

> **Important**: Always backup your database before running migrations in production environments.

### 2. Install Required Dependencies

The OIDC SSO implementation requires the `openid-client` package. Install it using:

```bash
pnpm add openid-client --filter n8n
```

### 2. Configure Environment Variables

Set the following environment variables to enable and configure OIDC:

```bash
# Enable the OIDC feature
N8N_SSO_OIDC_ENABLED=true

# Set authentication method to OIDC
# This is required for OIDC to be used as the primary authentication method
N8N_DEFAULT_AUTH_METHOD=oidc

# OIDC provider configuration
N8N_OIDC_ISSUER_URL=https://your-identity-provider.com
N8N_OIDC_CLIENT_ID=your-client-id
N8N_OIDC_CLIENT_SECRET=your-client-secret
N8N_OIDC_REDIRECT_URL=https://{n8n-host}/sso/oidc/callback
```

### 3. Optional Configuration

```bash
# Scopes requested from the OIDC provider (space-separated)
N8N_OIDC_SCOPES="openid email profile"

# Enable just-in-time user provisioning
N8N_OIDC_JIT_PROVISIONING=true

# Automatically redirect from login page to OIDC flow
N8N_OIDC_REDIRECT_LOGIN_TO_SSO=true
```

## Usage

### For Users

1. Navigate to the n8n login page
2. If `N8N_OIDC_REDIRECT_LOGIN_TO_SSO` is enabled, you will be automatically redirected to your identity provider for authentication
3. If not enabled, you must manually initiate the OIDC flow by navigating to `/sso/oidc/login`
4. After successful authentication with the identity provider, you will be redirected back to n8n and logged in
5. If JIT provisioning is enabled and you don't have an account yet, one will be created automatically

### For Administrators

1. Configure your OIDC identity provider (IdP) with the required client ID and secret
2. Register the callback URL (`https://{n8n-host}/sso/oidc/callback`) with your IdP
3. Configure n8n with the environment variables listed above
4. Test the authentication flow
5. Monitor logs for any OIDC-related issues

## Troubleshooting

### OIDC Authentication Not Working

1. Verify that `N8N_SSO_OIDC_ENABLED` is set to `true`
2. Ensure `N8N_DEFAULT_AUTH_METHOD` is set to `oidc`
3. Check that the OIDC provider configuration is correct
4. Review server logs for any OIDC-related errors

### User Not Created After Successful Authentication

1. Verify that `N8N_OIDC_JIT_PROVISIONING` is enabled
2. Ensure the IdP is sending the required claims (email, name)
3. Check for any errors in the user creation process

### Not Redirecting to OIDC Provider

1. Verify that `N8N_OIDC_REDIRECT_LOGIN_TO_SSO` is set to `true`
2. Check that the OIDC implementation is correctly registered in the server
3. Try accessing `/sso/oidc/login` directly to bypass the login page
4. Compatibility testing with major identity providers:
   - Okta
   - Azure AD
   - Auth0
   - Google
   - Keycloak

## Rollout Plan

1. Implement the feature behind a feature flag (`sso.oidcEnabled = false` by default)
2. Test in non-production environments with various identity providers
3. Document the feature and update the n8n documentation
4. Release as part of the Enterprise Edition
5. Provide migration guides for customers currently using SAML

## Comparison with Existing SSO Methods

| Feature | Email/Password | LDAP | SAML | OIDC |
|---------|---------------|------|------|------|
| Default | Yes | No | No | No |
| Enterprise | No | Yes | Yes | Yes |
| License Required | No | Yes | Yes | No |
| JIT Provisioning | N/A | Yes | Yes | Yes |
| MFA Support | Yes | Yes | Via IdP | Via IdP |
| Owner Fallback | N/A | Yes | Yes | Yes |

## References

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [n8n Authentication Documentation](https://docs.n8n.io/hosting/authentication/)
- [openid-client NPM package](https://www.npmjs.com/package/openid-client)
