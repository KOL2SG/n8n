import { z } from 'zod';

import { Config, Env, Nested } from '../decorators';

@Config
class OidcConfig {
	/** OIDC Issuer URL */
	@Env('OIDC_ISSUER_URL')
	issuerUrl: string = '';

	/** OIDC Client ID */
	@Env('OIDC_CLIENT_ID')
	clientId: string = '';

	/** OIDC Client Secret */
	@Env('OIDC_CLIENT_SECRET')
	clientSecret: string = '';

	/** OIDC Redirect URI */
	@Env('OIDC_REDIRECT_URI')
	redirectUri: string = '';

	/** OIDC Scopes (space-separated) */
	@Env('OIDC_SCOPES')
	scopes: string = 'openid email profile';

	/** Whether to enable Just-In-Time provisioning */
	@Env('OIDC_JIT_PROVISIONING')
	jitProvisioning: boolean = true;

	/** Whether to redirect login page to SSO */
	@Env('OIDC_REDIRECT_LOGIN_TO_SSO')
	redirectLoginToSso: boolean = false;
}

@Config
export class SsoConfig {
	/** Whether to enable OIDC SSO */
	@Env('SSO_OIDC_ENABLED')
	oidcEnabled: boolean = false;

	/** Whether to enable just-in-time user provisioning on login */
	@Env('SSO_JUST_IN_TIME_PROVISIONING')
	justInTimeProvisioning: boolean = false;

	/** Whether to redirect users from login page to SSO */
	@Env('SSO_REDIRECT_LOGIN_TO_SSO')
	redirectLoginToSso: boolean = false;

	/** OIDC configuration */
	@Nested
	oidc: OidcConfig;
}
