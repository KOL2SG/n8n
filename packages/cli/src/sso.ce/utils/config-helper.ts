import config from '@/config';

/**
 * Utility functions to safely access config values with proper TypeScript type casting
 * This is a workaround for the TypeScript errors related to config paths
 */

export function getOidcEnabled(): boolean {
	return Boolean(config.getEnv('sso.oidcEnabled' as any));
}

export function getOidcIssuerUrl(): string {
	return String(config.getEnv('oidc.issuerUrl' as any) || '');
}

export function getOidcClientId(): string {
	return String(config.getEnv('oidc.clientId' as any) || '');
}

export function getOidcClientSecret(): string {
	return String(config.getEnv('oidc.clientSecret' as any) || '');
}

export function getOidcRedirectUri(): string {
	return String(config.getEnv('oidc.redirectUri' as any) || '');
}

export function getOidcScopes(): string[] {
	const scopesString = String(config.getEnv('oidc.scopes' as any) || 'openid email profile');
	return scopesString.split(' ');
}

export function getOidcJitProvisioning(): boolean {
	return config.getEnv('oidc.jitProvisioning' as any) !== false;
}

export function getOidcRedirectLoginToSso(): boolean {
	return config.getEnv('oidc.redirectLoginToSso' as any) === true;
}
