// Support OIDC as an authentication method
import '@/auth/auth.service';
import '@n8n/db';

// Support OIDC as an authentication method
declare module '@/auth/auth.service' {
	type AuthenticationMethod = 'email' | 'ldap' | 'saml' | 'oidc';
}

// Support OIDC in event payloads
declare module '@/events/event.service' {
	interface EventPayloadLoginFailed {
		authenticationMethod: 'email' | 'ldap' | 'saml' | 'oidc';
		userEmail: string;
		reason: string;
	}

	interface EventPayloadLoggedIn {
		user: any;
		authenticationMethod: 'email' | 'ldap' | 'saml' | 'oidc';
	}
}

// Recognize OIDC in AuthIdentity mapping
declare module '@n8n/db' {
	interface AuthProviderTypeMap {
		oidc: string;
	}
}
