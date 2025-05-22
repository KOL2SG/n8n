# OIDC SSO Implementation Plan (Community Edition)

Track progress with [ ] (pending) and [x] (done).

## Checklist

- [x] Add 'oidc' to `AuthProviderType` enum & extend `AuthIdentity` for OIDC
- [x] Add feature flag `sso.oidcEnabled` guard in code (module, service, controller)
- [x] Create `src/sso.cc/sso-helpers.cc.ts` with OIDC helper functions
- [x] Create `src/sso.cc/oidc/oidc.service.cc.ts` implementing `OidcServiceCE`
- [x] Create `src/sso.cc/oidc/oidc.controller.cc.ts` with `/login` and `/callback` routes
- [x] Register OIDC components in server.ts (using community version)
- [x] Add env-var schema validation for OIDC settings in `config`
- [x] Implement JIT user provisioning behind feature flag (no license check required)
- [x] Install required dependency: `openid-client`
- [x] Update `AuthController.login()` to handle OIDC redirection
- [ ] Write unit tests for `OidcServiceCE` and `OidcControllerCE`
- [ ] Write integration tests with a mock OIDC provider
- [x] Update `doc/sso-addon.md` with final instructions
- [x] Deploy behind feature flag and verify in staging

## Progress Details

| Task                                | Status | Notes                                   |
|-------------------------------------|:------:|-----------------------------------------|
| Add 'oidc' to enum & extend AuthIdentity |   [x]   | In `@n8n/db` code                       |
| Add feature flag guard              |   [x]   | `sso.oidcEnabled` in code               |
| Create `sso-helpers.cc.ts`          |   [x]   | Community version of SSO helpers        |
| Create `OidcServiceCE`              |   [x]   | Created with PKCE implementation        |
| Create `OidcControllerCE`           |   [x]   | Express router for OIDC endpoints       |
| Register in server.ts               |   [x]   | Added community version to server       |
| Add openid-client dependency        |   [x]   | Installed with `pnpm add openid-client --filter n8n` |
| Update login flow                   |   [x]   | Added redirection to OIDC in AuthController |
| Config validation                   |   [x]   | Added `sso.config.ts`                   |
| JIT provisioning                    |   [x]   | Implemented in `OidcServiceCE`          |
| Unit tests                          |   [ ]   | Need to mock `openid-client`            |
| Integration tests                   |   [ ]   | Need identity server for tests          |
| Docs update                         |   [x]   | Updated with recent implementation details |
| Feature flag + staging              |   [x]   | Tested with Microsoft Entra ID          |

## Implementation Details

### OIDC Identity Mapping

Rather than adding columns to the `User` table, we reuse the existing `AuthIdentity` entity:

1. Extend `AuthProviderType` with `'oidc'` in `@n8n/db/src/entities/types-db.ts`
2. On successful OIDC login, call:
   ```ts
   const identity = AuthIdentity.create(user, subject, 'oidc');
   await Container.get(AuthIdentityRepository).save(identity);
   ```
3. Lookup by `{ providerType: 'oidc', providerId: subject }`, joining `user.authIdentities`
4. JIT provisioning creates both `User` and `AuthIdentity` when no existing identity is found

### OIDC Authentication Flow

The implemented OIDC SSO solution follows this flow:

1. **Login Initiation**: User navigates to `/rest/sso/oidc/login` endpoint
2. **Authorization Request**: System generates PKCE code challenge and redirects to the Identity Provider
3. **Authentication at IdP**: User authenticates at the OIDC provider
4. **Callback Processing**: Provider redirects to `/rest/sso/oidc/callback` with authorization code
5. **Token Exchange**: System exchanges code for tokens using PKCE verification
6. **User Provisioning**: System finds or creates user based on OIDC claims
7. **Session Creation**: JWT is issued and user is redirected to the n8n dashboard

### Key Components Implemented

#### 1. Feature Flag Protection
- All OIDC functionality is guarded by the `sso.oidcEnabled` feature flag
- Both login and callback endpoints check this flag before processing

#### 2. OIDC Service (`OidcServiceCE`)
- Dynamically imports the ESM-only `openid-client` package at runtime via `await import` to avoid CJS interop issues
- Implements OpenID Connect client functionality with PKCE flow
- Provides methods for:
  - Client initialization and discovery of OIDC provider metadata
  - Authorization URL generation with PKCE code challenge
  - Token exchange and validation using PKCE code verifier
  - User lookup or just-in-time provisioning based on OIDC claims
- Properly handles redirect URL format to match what's registered with identity provider

#### 3. OIDC Controller (`OidcControllerCE`)
- Provides Express routes for OIDC workflow:
  - `/login`: Initiates the OIDC authentication flow
  - `/callback`: Processes the OIDC provider callback
- Handles error conditions and redirects to appropriate URLs
- Registered at `/sso/oidc` but accessed via `/rest/sso/oidc/*` paths

#### 4. Just-in-Time (JIT) User Provisioning
- Automatically creates new user accounts based on OIDC claims
- Maps OIDC attributes to n8n user properties
- Updates existing users with OIDC identifiers if found by email
- Uses the correct User entity relations in database queries

### Configuration Options

The implementation supports these configuration parameters:

- `sso.oidcEnabled`: Master feature flag for OIDC functionality
- `oidc.issuerUrl`: URL of the OIDC identity provider
- `oidc.clientId`: OAuth client ID registered with the provider
- `oidc.clientSecret`: OAuth client secret
- `oidc.redirectUri`: Callback URL registered with the provider (must match exactly)
- `oidc.scopes`: OAuth scopes to request (defaults to "openid email profile")
- `oidc.jitProvisioning`: Enable/disable just-in-time user creation
- `oidc.redirectLoginToSso`: Automatically redirect login page to SSO

### Resolved Issues

1. **TypeScript Type Compatibility**
   - Created declaration files in `/packages/cli/src/types/` to extend TypeScript type system
   - Added missing type definitions for config paths, authentication methods and event payloads
   - Implemented type-safe utility functions to access configuration values
   - Added appropriate type assertions to handle API mismatches

2. **URL Path Handling**
   - Fixed handling of `/rest/` prefix in URL paths
   - Ensured redirect URL in token exchange matches exactly what's registered with provider
   - Added debugging logs for URL path resolution

3. **User Entity Querying**
   - Fixed relations used when querying User entity
   - Removed non-existent `globalRole` relation (it's a column, not a relation)
   - Used correct relation paths: `['user', 'user.authIdentities']` and `['authIdentities']`

### Remaining Issues

1. **ESLint Configuration**
   - ESLint warnings about TSConfig not including new files
   - Not critical for functionality but should be addressed for clean linting

### Pending Tasks

1. **Implementation Refinement and Bug Fixes**:
   - ✓ Package `openid-client` is installed and implemented
   - ✓ Fixed TypeScript errors with config paths and authentication method types
   - ✓ Created type-safe config helper utilities
   - ✓ Added proper type declarations for config paths and authentication methods
   - ✓ Added type declarations for event payload interfaces
   - ✓ Fixed method signature mismatches (issueCookie vs issueJWT)
   - ✓ Improved error handling in token validation and callback processing
   - ✓ Fixed potential race conditions in config registration/loading
   - ✓ Added comprehensive logging for OIDC authentication flow
   - ✓ Ensured proper cleanup of PKCE verifier and nonce after use
   - ✓ Fixed query parameter type handling for the callback endpoint
   - ✓ Fixed redirect URL handling for token exchange
   - ✓ Fixed User entity relation queries

2. **Done: Login Flow Integration**:
   - ✓ Updated `AuthController.login()` to redirect to OIDC when enabled
   - ✓ Integrated with the existing authentication flow
   - ✓ Added configuration options for controlling redirection

3. **Testing**:
   - Write unit tests for OIDC components
   - Create integration tests with a mock OIDC provider
   - Test with popular identity providers (Okta, Auth0, Azure AD, Google)

4. **Deployment**:
   - Deploy the feature behind the feature flag
   - Verify functionality in staging environment

### Security Considerations

- Implementation uses PKCE (Proof Key for Code Exchange) for enhanced security
- All sensitive operations are protected by the feature flag
- Error handling preserves security by not exposing sensitive details
- User provisioning is controlled by a separate configuration option
