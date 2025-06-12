import { computed } from 'vue';
import { useUsersStore } from '@/stores/users.store';
import { useSettingsStore } from '@/stores/settings.store';

/**
 * Composable for OIDC-related helper functions
 */
export function useOidcHelpers() {
	const usersStore = useUsersStore();
	const settingsStore = useSettingsStore();

	/**
	 * Check if the current user is authenticated via OIDC
	 */
	const hasOidcIdentity = computed((): boolean => {
		// Primary method: Check the authentication method from settings
		// This is the most reliable way to detect OIDC authentication
		if (settingsStore.userManagement.authenticationMethod === 'oidc') {
			return true;
		}

		// Fallback method: Check user object properties (for backward compatibility)
		const currentUser = usersStore.currentUser;
		if (!currentUser) {
			return false;
		}

		// Check for authIdentities with providerType === 'oidc'
		if (currentUser.authIdentities?.some((identity) => identity.providerType === 'oidc')) {
			return true;
		}

		// Check signInType property
		return currentUser.signInType === 'oidc';
	});

	/**
	 * Check if the current user should have access to personal settings
	 * OIDC users should not have access to personal settings as these are managed externally
	 */
	const canAccessPersonalSettings = computed((): boolean => {
		return !hasOidcIdentity.value;
	});

	return {
		hasOidcIdentity,
		canAccessPersonalSettings,
	};
}
