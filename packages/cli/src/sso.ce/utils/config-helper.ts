/**
 * Utility functions to safely access config values with proper TypeScript type casting
 * This is a workaround for the TypeScript errors related to config paths
 */

export function getOidcEnabled(): boolean {
	return process.env.N8N_SSO_OIDC_ENABLED === 'true';
}

export function getOidcIssuerUrl(): string {
	return process.env.N8N_OIDC_ISSUER_URL || '';
}

export function getOidcClientId(): string {
	return process.env.N8N_OIDC_CLIENT_ID || '';
}

export function getOidcClientSecret(): string {
	return process.env.N8N_OIDC_CLIENT_SECRET || '';
}

export function getOidcRedirectUri(): string {
	return process.env.N8N_OIDC_REDIRECT_URL || '';
}

export function getOidcScopes(): string[] {
	const scopes = process.env.N8N_OIDC_SCOPES || 'openid email profile';
	return scopes.split(/\s+/).filter(Boolean);
}

export function getOidcJitProvisioning(): boolean {
	return process.env.N8N_OIDC_JIT_PROVISIONING === 'true';
}

export function getOidcRedirectLoginToSso(): boolean {
	return process.env.N8N_OIDC_REDIRECT_LOGIN_TO_SSO === 'true';
}
