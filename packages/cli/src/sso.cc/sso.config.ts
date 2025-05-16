import config from '@/config';

/**
 * SSO configuration for OIDC (Community Edition)
 *
 * This adds the necessary configuration options for OIDC SSO
 */
export const ssoConfig = {
	// SSO OIDC settings
	'sso.oidcEnabled': {
		doc: 'Whether to enable OIDC SSO.',
		format: Boolean,
		default: false,
		env: 'N8N_SSO_OIDC_ENABLED',
	},

	// OIDC Provider settings
	'oidc.issuerUrl': {
		doc: 'URL of the OIDC identity provider issuer.',
		format: String,
		default: '',
		env: 'N8N_OIDC_ISSUER_URL',
	},

	'oidc.clientId': {
		doc: 'Client ID for the OIDC provider.',
		format: String,
		default: '',
		env: 'N8N_OIDC_CLIENT_ID',
	},

	'oidc.clientSecret': {
		doc: 'Client secret for the OIDC provider.',
		format: String,
		default: '',
		env: 'N8N_OIDC_CLIENT_SECRET',
	},

	'oidc.redirectUri': {
		doc: 'Redirect URI registered with the OIDC provider.',
		format: String,
		default: '',
		env: 'N8N_OIDC_REDIRECT_URL',
	},

	'oidc.scopes': {
		doc: 'OIDC scopes to request, space-separated.',
		format: String,
		default: 'openid email profile',
		env: 'N8N_OIDC_SCOPES',
	},

	'oidc.jitProvisioning': {
		doc: 'Whether to enable just-in-time user provisioning for OIDC.',
		format: Boolean,
		default: true,
		env: 'N8N_OIDC_JIT_PROVISIONING',
	},

	'oidc.redirectLoginToSso': {
		doc: 'Whether to automatically redirect users from login to OIDC flow.',
		format: Boolean,
		default: false,
		env: 'N8N_OIDC_REDIRECT_LOGIN_TO_SSO',
	},
};

// Register all SSO configuration options
Object.entries(ssoConfig).forEach(([key, options]) => {
	try {
		// @ts-ignore - We know this is correct usage of the config
		config.set(key as any, options);
	} catch (error) {
		console.error(`Failed to register SSO config option ${key}:`, error);
	}
});
