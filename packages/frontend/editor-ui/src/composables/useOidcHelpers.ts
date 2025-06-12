import { computed } from 'vue';
import { useUsersStore } from '@/stores/users.store';

/**
 * Composable for OIDC-related helper functions
 */
export function useOidcHelpers() {
	const usersStore = useUsersStore();

	/**
	 * Check if the current user is authenticated via OIDC
	 */
	const hasOidcIdentity = computed((): boolean => {
		const currentUser = usersStore.currentUser;
		if (!currentUser) {
			return false;
		}

		// Primary check: Look for authIdentities with providerType === 'oidc'
		if (currentUser.authIdentities?.some((identity) => identity.providerType === 'oidc')) {
			return true;
		}

		// Secondary check: Check signInType property
		// Some API responses might not include authIdentities but will have signInType
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
