// Fix type compatibility between AuthProviderType and AuthenticationMethod
import '@/auth/auth.service';
import '@n8n/db';

// Fix AuthenticationMethod in auth.service
declare module '@/auth/auth.service' {
	type AuthenticationMethod = 'email' | 'ldap' | 'saml' | 'oidc';
}

// Fix AuthenticationMethod in events/event.service
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

// Ensure oidc is recognized in the auth provider type
declare module '@n8n/db' {
	interface AuthProviderTypeMap {
		oidc: string;
	}
}
