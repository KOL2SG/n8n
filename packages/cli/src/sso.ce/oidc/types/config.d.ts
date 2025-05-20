import '@n8n/config';

declare module '@n8n/config' {
	interface ConfigOptionPathMap {
		'sso.oidcEnabled': boolean;
		'oidc.issuerUrl': string;
		'oidc.clientId': string;
		'oidc.clientSecret': string;
		'oidc.redirectUri': string;
		'oidc.scopes': string;
		'oidc.jitProvisioning': boolean;
		'oidc.redirectLoginToSso': boolean;
	}
}
