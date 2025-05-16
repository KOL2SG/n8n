import { SettingsRepository, UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { Logger } from 'n8n-core';
import { ApplicationError } from 'n8n-workflow';

import config from '@/config';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { UrlService } from '@/services/url.service';
import { AuthService } from '@/auth/auth.service';

import {
	isOidcCurrentAuthenticationMethod,
	isSsoJustInTimeProvisioningEnabled,
} from '../sso-helpers.cc';

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
	) {}

	async init(): Promise<void> {
		try {
			// Check if the OIDC feature flag is enabled
			const featureEnabled = config.getEnv('sso.oidcEnabled');
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
			issuerUrl: (config.getEnv('oidc.issuerUrl') as string) || '',
			clientId: (config.getEnv('oidc.clientId') as string) || '',
			clientSecret: (config.getEnv('oidc.clientSecret') as string) || '',
			redirectUri: (config.getEnv('oidc.redirectUri') as string) || '',
			scopes: ((config.getEnv('oidc.scopes') as string) || 'openid email profile').split(' '),
			jitProvisioning: config.getEnv('oidc.jitProvisioning') !== false,
			redirectLoginToSso: config.getEnv('oidc.redirectLoginToSso') === true,
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

	async handleCallback(callbackParams: any): Promise<any> {
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
		// Get the claims from the token set
		const claims = tokenSet.claims();

		const subject = claims.sub;
		const issuer = claims.iss;

		if (!subject) {
			throw new BadRequestError('Invalid token - missing subject claim');
		}

		// First try to find an existing user by OIDC subject and issuer
		let user = await this.userRepository.findOne({
			where: {
				oidcSubject: subject,
				oidcIssuer: issuer,
			},
			relations: ['authIdentities', 'globalRole'],
		});

		// If found, return the user
		if (user) {
			return { user, isNew: false };
		}

		// If not found, try to find by email if present in claims
		const email = claims.email as string;
		if (email) {
			user = await this.userRepository.findOne({
				where: {
					email,
				},
				relations: ['authIdentities', 'globalRole'],
			});

			if (user) {
				// Update the user with OIDC identifiers
				user.oidcSubject = subject;
				user.oidcIssuer = issuer;
				await this.userRepository.save(user);
				return { user, isNew: false };
			}
		}

		// If no user found and JIT provisioning is enabled, create a new user
		if (isSsoJustInTimeProvisioningEnabled()) {
			// Create a new user based on OIDC claims
			const userData = {
				email: email || `${subject}@oidc.user`,
				firstName: (claims.name as string)?.split(' ')[0] || '',
				lastName: (claims.name as string)?.split(' ').slice(1).join(' ') || '',
				oidcSubject: subject,
				oidcIssuer: issuer,
			};

			const newUser = await this.userRepository.save(this.userRepository.create(userData));

			return { user: newUser, isNew: true };
		}

		throw new BadRequestError('User not found and JIT provisioning is disabled');
	}
}
