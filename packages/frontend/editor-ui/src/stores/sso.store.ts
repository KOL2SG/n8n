import type { OidcConfigDto, SamlPreferences } from '@n8n/api-types';
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useRootStore } from '@n8n/stores/useRootStore';
import * as ssoApi from '@n8n/rest-api-client/api/sso';
import type { SamlPreferencesExtractedData } from '@n8n/rest-api-client/api/sso';
import * as ldapApi from '@n8n/rest-api-client/api/ldap';
import type { LdapConfig } from '@n8n/rest-api-client/api/ldap';
import type { IDataObject } from 'n8n-workflow';
import type { UserManagementAuthenticationMethod } from '@/Interface';
import { useSettingsStore } from '@/stores/settings.store';

export const SupportedProtocols = {
	SAML: 'saml',
	OIDC: 'oidc',
} as const;

export type SupportedProtocolType = (typeof SupportedProtocols)[keyof typeof SupportedProtocols];

export const useSSOStore = defineStore('sso', () => {
	const rootStore = useRootStore();
	const settingsStore = useSettingsStore();

	const authenticationMethod = ref<UserManagementAuthenticationMethod | undefined>(undefined);
	const selectedAuthProtocol = ref<SupportedProtocolType | undefined>(undefined);

	// SAML and LDAP state
	const saml = ref<Pick<SamlPreferences, 'loginLabel' | 'loginEnabled'>>({
		loginLabel: '',
		loginEnabled: false,
	});

	const ldap = ref<Pick<LdapConfig, 'loginLabel' | 'loginEnabled'>>({
		loginLabel: '',
		loginEnabled: false,
	});

	const oidc = ref<
		Pick<OidcConfigDto, 'loginEnabled'> & {
			loginUrl?: string;
			callbackUrl?: string;
		}
	>({
		loginUrl: '',
		loginEnabled: false,
		callbackUrl: '',
	});

	// Enterprise feature flags - OIDC is now available in CE
	const isEnterpriseLdapEnabled = ref(false);
	const isEnterpriseSamlEnabled = ref(false);

	// Computed properties
	const isSamlLoginEnabled = computed({
		get: () => saml.value.loginEnabled,
		set: (value: boolean) => {
			saml.value.loginEnabled = value;
			void toggleLoginEnabled(value);
		},
	});

	const isDefaultAuthenticationSaml = computed(() => settingsStore.isDefaultAuthenticationSaml);

	const isOidcLoginEnabled = computed({
		get: () => settingsStore.isOidcLoginEnabled,
		set: (value: boolean) => {
			settingsStore.setSettings({
				...settingsStore.settings,
				sso: {
					...settingsStore.settings.sso,
					oidc: {
						...settingsStore.settings.sso.oidc,
						loginEnabled: value,
					},
				},
			});
		},
	});

	const isDefaultAuthenticationOidc = computed(() => settingsStore.isDefaultAuthenticationOidc);

	const isLdapLoginEnabled = computed(() => ldap.value.loginEnabled);
	const ldapLoginLabel = computed(() => ldap.value.loginLabel);

	// SAML functions - define before use
	const toggleLoginEnabled = async (enabled: boolean) =>
		await ssoApi.toggleSamlConfig(rootStore.restApiContext, { loginEnabled: enabled });

	// Modified SSO button visibility logic - OIDC works in CE, SAML requires EE
	const showSsoLoginButton = computed(
		() =>
			(isSamlLoginEnabled.value &&
				isEnterpriseSamlEnabled.value &&
				isDefaultAuthenticationSaml.value) ||
			(isOidcLoginEnabled.value && isDefaultAuthenticationOidc.value), // Removed enterprise check for OIDC
	);

	const getSSORedirectUrl = async (existingRedirect?: string) =>
		await ssoApi.initSSO(rootStore.restApiContext, existingRedirect);

	const initialize = (options: {
		authenticationMethod: UserManagementAuthenticationMethod;
		config: {
			ldap?: Pick<LdapConfig, 'loginLabel' | 'loginEnabled'>;
			saml?: Pick<SamlPreferences, 'loginLabel' | 'loginEnabled'>;
			oidc?: Pick<OidcConfigDto, 'loginEnabled'> & {
				loginUrl?: string;
				callbackUrl?: string;
			};
		};
		features: {
			saml: boolean;
			ldap: boolean;
			oidc: boolean;
		};
	}) => {
		authenticationMethod.value = options.authenticationMethod;

		isEnterpriseLdapEnabled.value = options.features.ldap;
		if (options.config.ldap) {
			ldap.value.loginEnabled = options.config.ldap.loginEnabled;
			ldap.value.loginLabel = options.config.ldap.loginLabel;
		}

		isEnterpriseSamlEnabled.value = options.features.saml;
		if (options.config.saml) {
			saml.value.loginEnabled = options.config.saml.loginEnabled;
			saml.value.loginLabel = options.config.saml.loginLabel;
		}

		// OIDC is now available in CE - no enterprise check needed
		if (options.config.oidc) {
			oidc.value.loginEnabled = options.config.oidc.loginEnabled;
			oidc.value.loginUrl = options.config.oidc.loginUrl ?? '';
			oidc.value.callbackUrl = options.config.oidc.callbackUrl ?? '';
		}
	};

	// Additional SAML functions

	const getSamlMetadata = async () => await ssoApi.getSamlMetadata(rootStore.restApiContext);

	const samlConfig = ref<SamlPreferences & SamlPreferencesExtractedData>();

	const getSamlConfig = async () => {
		const config = await ssoApi.getSamlConfig(rootStore.restApiContext);
		samlConfig.value = config;
		return config;
	};

	const saveSamlConfig = async (config: Partial<SamlPreferences>) =>
		await ssoApi.saveSamlConfig(rootStore.restApiContext, config);

	const testSamlConfig = async () => await ssoApi.testSamlConfig(rootStore.restApiContext);

	// OIDC functions
	const oidcConfig = ref<OidcConfigDto | undefined>();

	const getOidcConfig = async () => {
		const config = await ssoApi.getOidcConfig(rootStore.restApiContext);
		oidcConfig.value = config;
		return config;
	};

	const saveOidcConfig = async (config: OidcConfigDto) => {
		const savedConfig = await ssoApi.saveOidcConfig(rootStore.restApiContext, config);
		oidcConfig.value = savedConfig;
		return savedConfig;
	};

	// LDAP functions
	const getLdapConfig = async () => {
		return await ldapApi.getLdapConfig(rootStore.restApiContext);
	};

	const getLdapSynchronizations = async (pagination: { page: number }) => {
		return await ldapApi.getLdapSynchronizations(rootStore.restApiContext, pagination);
	};

	const testLdapConnection = async () => {
		return await ldapApi.testLdapConnection(rootStore.restApiContext);
	};

	const updateLdapConfig = async (ldapConfig: LdapConfig) => {
		return await ldapApi.updateLdapConfig(rootStore.restApiContext, ldapConfig);
	};

	const runLdapSync = async (data: IDataObject) => {
		return await ldapApi.runLdapSync(rootStore.restApiContext, data);
	};

	// Determine which SSO type is active
	const ssoType = computed(() => {
		if (isOidcLoginEnabled.value && isDefaultAuthenticationOidc.value) {
			return 'oidc';
		}
		if (
			isSamlLoginEnabled.value &&
			isEnterpriseSamlEnabled.value &&
			isDefaultAuthenticationSaml.value
		) {
			return 'saml';
		}
		return null;
	});

	const initializeSelectedProtocol = () => {
		if (selectedAuthProtocol.value) return;

		selectedAuthProtocol.value = isDefaultAuthenticationOidc.value
			? SupportedProtocols.OIDC
			: SupportedProtocols.SAML;
	};

	return {
		showSsoLoginButton,
		getSSORedirectUrl,
		initialize,
		selectedAuthProtocol,
		initializeSelectedProtocol,

		saml,
		samlConfig,
		isSamlLoginEnabled,
		isEnterpriseSamlEnabled,
		isDefaultAuthenticationSaml,
		isOidcLoginEnabled,
		isDefaultAuthenticationOidc,
		ssoType,
		getSamlMetadata,
		getSamlConfig,
		saveSamlConfig,
		testSamlConfig,

		oidc,
		oidcConfig,
		getOidcConfig,
		saveOidcConfig,

		ldap,
		isLdapLoginEnabled,
		isEnterpriseLdapEnabled,
		ldapLoginLabel,
		getLdapConfig,
		getLdapSynchronizations,
		testLdapConnection,
		updateLdapConfig,
		runLdapSync,
	};
});
