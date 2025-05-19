import { SettingsRepository, UserRepository, AuthIdentity, AuthIdentityRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { Logger } from 'n8n-core';
import { ApplicationError } from 'n8n-workflow';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { UrlService } from '@/services/url.service';
import { AuthService } from '@/auth/auth.service';

import {
	isOidcCurrentAuthenticationMethod,
	isSsoJustInTimeProvisioningEnabled,
} from '../sso-helpers.cc';
import {
	getOidcEnabled,
	getOidcIssuerUrl,
	getOidcClientId,
	getOidcClientSecret,
	getOidcRedirectUri,
	getOidcScopes,
	getOidcJitProvisioning,
	getOidcRedirectLoginToSso,
} from '../utils/config-helper';

import type { User } from '@n8n/db';
import type { DeepPartial } from '@n8n/typeorm';

// Use CommonJS require to bypass TypeScript issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Issuer } = require('openid-client');

interface OidcPreferences {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scopes: string[];
	jitProvisioning: boolean;
	redirectLoginToSso: boolean;
}

@Service()
export class OidcServiceCC {
	// Use any type for the client to avoid TypeScript errors
	private oidcClient: any = null;
	private pkceVerifier: string | null = null;
	private nonce: string | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly urlService: UrlService,
		private readonly userRepository: UserRepository,
		private readonly settingsRepository: SettingsRepository,
		private readonly authService: AuthService,
		private readonly authIdentityRepository: AuthIdentityRepository,
	) {}

	async init(): Promise<void> {
		try {
			// Check if the OIDC feature flag is enabled
			const featureEnabled = getOidcEnabled();
			if (featureEnabled) {
				await this.initClient();
			}
		} catch (error) {
			this.logger.error(
				`OIDC initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async initClient(): Promise<void> {
		try {
			const preferences = this.getConfigPreferences();

			if (!preferences.issuerUrl || !preferences.clientId) {
				this.logger.debug('OIDC not configured, skipping initialization');
				return;
			}

			this.logger.debug('Initializing OIDC client with issuer', {
				issuerUrl: preferences.issuerUrl,
			});

			// First discover the OIDC provider's endpoints
			const issuer = await Issuer.discover(preferences.issuerUrl);
			this.logger.debug('OIDC issuer discovered successfully');

			// Create a client instance
			this.oidcClient = new issuer.Client({
				client_id: preferences.clientId,
				client_secret: preferences.clientSecret,
				redirect_uris: [preferences.redirectUri],
				response_types: ['code'],
			});

			this.logger.debug('OIDC client initialized successfully');
		} catch (error) {
			this.logger.error(
				`OIDC client initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new ApplicationError('Failed to initialize OIDC client');
		}
	}

	getConfigPreferences(): OidcPreferences {
		return {
			issuerUrl: getOidcIssuerUrl(),
			clientId: getOidcClientId(),
			clientSecret: getOidcClientSecret(),
			redirectUri: getOidcRedirectUri(),
			scopes: getOidcScopes(),
			jitProvisioning: getOidcJitProvisioning(),
			redirectLoginToSso: getOidcRedirectLoginToSso(),
		};
	}

	isOidcLoginEnabled(): boolean {
		return isOidcCurrentAuthenticationMethod();
	}

	shouldRedirectLoginToSso(): boolean {
		return this.getConfigPreferences().redirectLoginToSso && this.isOidcLoginEnabled();
	}

	isInitialized(): boolean {
		return this.oidcClient !== null;
	}

	generateAuthorizationUrl(): string {
		if (!this.isInitialized()) {
			throw new BadRequestError('OIDC client not initialized');
		}

		const preferences = this.getConfigPreferences();
		// The generators functions are available on the Issuer class
		this.pkceVerifier = Issuer.generators.codeVerifier();
		this.nonce = Issuer.generators.nonce();
		const state = Issuer.generators.state();

		const codeChallenge = Issuer.generators.codeChallenge(this.pkceVerifier);

		return this.oidcClient!.authorizationUrl({
			scope: preferences.scopes.join(' '),
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			nonce: this.nonce,
			state,
		});
	}

	async handleCallback(callbackParams: Record<string, string | string[]>): Promise<any> {
		if (!this.isInitialized()) {
			throw new BadRequestError('OIDC client not initialized');
		}

		if (!this.pkceVerifier) {
			throw new BadRequestError('PKCE verification failed - missing verifier');
		}

		try {
			// Verify the callback parameters and exchange the code for tokens
			const tokenSet = await this.oidcClient!.callback(
				this.getConfigPreferences().redirectUri,
				callbackParams,
				{
					code_verifier: this.pkceVerifier,
					nonce: this.nonce,
				},
			);

			// Clear the PKCE verifier and nonce after use
			this.pkceVerifier = null;
			this.nonce = null;

			return tokenSet;
		} catch (error) {
			this.logger.error(
				`OIDC callback error: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new BadRequestError('OIDC authentication failed');
		}
	}

	async findOrCreateUserByTokenSet(tokenSet: any): Promise<{ user: any; isNew: boolean }> {
		const claims = tokenSet.claims();
		const subject = claims.sub;
		if (!subject) {
			throw new BadRequestError('Invalid token - missing subject claim');
		}

		// 1. Try existing OIDC identity
		const identity = await this.authIdentityRepository.findOne({
			where: { providerType: 'oidc', providerId: subject },
			relations: ['user', 'user.authIdentities', 'user.globalRole'],
		});
		if (identity) {
			return { user: identity.user, isNew: false };
		}

		// 2. Fallback: find user by email claim
		const email = claims.email as string;
		if (email) {
			const user = await this.userRepository.findOne({
				where: { email },
				relations: ['authIdentities', 'globalRole'],
			});
			if (user) {
				const newIdentity = AuthIdentity.create(user, subject, 'oidc');
				await this.authIdentityRepository.save(newIdentity);
				return { user, isNew: false };
			}
		}

		// 3. JIT provisioning
		if (isSsoJustInTimeProvisioningEnabled()) {
			const userData: any = {
				email: email || `${subject}@oidc.user`,
				firstName: (claims.name as string)?.split(' ')[0] || '',
				lastName: (claims.name as string)?.split(' ').slice(1).join(' ') || '',
			};
			// Safely create a User entity and save to avoid ambiguous overloads
			const newUserEntity: User = this.userRepository.create(userData as DeepPartial<User>);
			const newUser: User = await this.userRepository.save(newUserEntity);
			const newIdentity = AuthIdentity.create(newUser, subject, 'oidc');
			await this.authIdentityRepository.save(newIdentity);
			return { user: newUser, isNew: true };
		}

		throw new BadRequestError('User not found and JIT provisioning is disabled');
	}
}
