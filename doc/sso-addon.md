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
- Respect existing license user limits
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
OIDC_ISSUER_URL=https://your-identity-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://{n8n-host}/sso/oidc/callback
OIDC_SCOPES=openid email profile
OIDC_JIT_PROVISIONING=true
OIDC_REDIRECT_LOGIN_TO_SSO=true
```

### 4. Database Schema Updates

Extend the user table with OIDC-specific fields:
- `oidcSubject`: Store the OIDC subject identifier (nullable)
- `oidcIssuer`: Store the issuer URL to handle multiple identity providers (nullable)

## Implementation Steps

### Backend Changes

1. Add `'oidc'` to the `AuthProviderType` enum in `@n8n/db`
2. Create a new `OidcService` class in `src/sso.ee/oidc.service.ts`
3. Extend `sso-helpers.ts` with OIDC-specific helper functions
4. Add new routes to `AuthController` or create a dedicated `OidcController`:
   - `/sso/oidc/login`
   - `/sso/oidc/callback`
5. Update the login method in `AuthController` to handle OIDC authentication
6. Implement JIT user provisioning for OIDC users

### Frontend Changes

1. Update the login view to show OIDC SSO option when configured
2. Add "Continue with SSO" button or auto-redirect based on settings
3. Create a loading/spinner page for the callback flow

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
| License Required | No | Yes | Yes | Yes |
| JIT Provisioning | N/A | Yes | Yes | Yes |
| MFA Support | Yes | Yes | Via IdP | Via IdP |
| Owner Fallback | N/A | Yes | Yes | Yes |

## References

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [n8n Authentication Documentation](https://docs.n8n.io/hosting/authentication/)
- [openid-client NPM package](https://www.npmjs.com/package/openid-client)
