# OIDC SSO Implementation Plan

Track progress with [ ] (pending) and [x] (done).

## Checklist

- [ ] Add `oidc` to `AuthProviderType` enum in `@n8n/db`
- [ ] Extend `sso-helpers.ts` with `isOidcCurrentAuthenticationMethod()`
- [ ] Create `src/sso.ee/oidc.service.ts` implementing `OidcService`
- [ ] Register `OidcService` provider in the DI container/module
- [ ] Create `src/controllers/oidc.controller.ts` with `/login` and `/callback` routes
- [ ] Import `OidcController` in the Nest module
- [ ] Update `AuthController.login()` to handle `oidc` method
- [ ] Add env-var schema validation for OIDC settings in `config`
- [ ] Write unit tests for `OidcService` and `OidcController`
- [ ] Write integration tests with a mock OIDC provider
- [ ] Update `doc/sso-addon.md` with final instructions
- [ ] Deploy behind feature flag and verify in staging

## Progress Details

| Task | Status | Notes |
|---|:---:|---|
| Add `oidc` to enum | [ ] | In `@n8n/db` code |
| Extend `sso-helpers.ts` | [ ] | Add helper function |
| Create `OidcService` | [ ] | Use `openid-client` and Nest lifecycle hooks |
| Register provider | [ ] | Update module metadata |
| Create controller | [ ] | Two endpoints: `/sso/oidc/login`, `/sso/oidc/callback` |
| Import controller | [ ] | In `app.module.ts` or feature module |
| Update login flow | [ ] | Fallback, MFA handling unchanged |
| Config validation | [ ] | Ensure env-vars present at startup |
| Unit tests | [ ] | Mock `openid-client` issuer |
| Integration tests | [ ] | Use test identity server or wiremock |
| Docs update | [x] | `doc/sso-addon.md` created |
| Feature flag + staging | [ ] | Toggle `sso.oidcEnabled` |
