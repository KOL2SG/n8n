import { SettingsRepository, type AuthProviderType } from '@n8n/db';
import { Container } from '@n8n/di';

import config from '@/config';

/**
 * Helper functions for SSO (Community edition)
 */

// OIDC-specific helper functions
export function isOidcEnabled(): boolean {
	return process.env.N8N_SSO_OIDC_ENABLED === 'true';
}

export function getCurrentAuthenticationMethod(): AuthProviderType {
	const oidcEnabled = isOidcEnabled();

	// If OIDC is enabled, it's an available authentication method regardless of auto-redirect setting
	// The auto-redirect setting only controls UI behavior, not authentication capability
	if (oidcEnabled) {
		return 'oidc';
	}

	// Otherwise, return the configured authentication method (email, ldap, etc.)
	return config.getEnv('userManagement.authenticationMethod');
}

export function isOidcCurrentAuthenticationMethod(): boolean {
	return getCurrentAuthenticationMethod() === 'oidc';
}

export function isEmailCurrentAuthenticationMethod(): boolean {
	return getCurrentAuthenticationMethod() === 'email';
}

/**
 * Only one authentication method can be active at a time. This function sets
 * the current authentication method and saves it to the database.
 */
export async function setCurrentAuthenticationMethod(
	authenticationMethod: AuthProviderType,
): Promise<void> {
	config.set('userManagement.authenticationMethod', authenticationMethod);
	await Container.get(SettingsRepository).save(
		{
			key: 'userManagement.authenticationMethod',
			value: authenticationMethod,
			loadOnStartup: true,
		},
		{ transaction: false },
	);
}

export function isSsoJustInTimeProvisioningEnabled(): boolean {
	return config.getEnv('sso.justInTimeProvisioning');
}

export function doRedirectUsersFromLoginToSsoFlow(): boolean {
	return config.getEnv('sso.redirectLoginToSso');
}

export function getOidcLoginLabel(): string {
	return 'OIDC';
}

export function shouldRedirectLoginToSso(): boolean {
	return isOidcEnabled() && doRedirectUsersFromLoginToSsoFlow();
}
