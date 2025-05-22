import { Service } from '@n8n/di';
import { Logger } from 'n8n-core';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { AuthService } from '@/auth/auth.service';
import { SettingsRepository, UserRepository, AuthIdentity, AuthIdentityRepository } from '@n8n/db';
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

@Service()
export class OidcServiceCE {
	private readonly logger: Logger;
	private pkceVerifier: string | null = null;
	private nonce: string | null = null;
	private state: string | null = null;
	private oidcClient: any | null = null;
	private generators: any;
	private oidcConfig: any | null = null;
	private readonly userRepository: UserRepository;
	private readonly settingsRepository: SettingsRepository;
	private readonly authService: AuthService;
	private readonly authIdentityRepository: AuthIdentityRepository;

	constructor(
		logger: Logger,
		userRepository: UserRepository,
		settingsRepository: SettingsRepository,
		authService: AuthService,
		authIdentityRepository: AuthIdentityRepository,
	) {
		this.logger = logger;
		this.userRepository = userRepository;
		this.settingsRepository = settingsRepository;
		this.authService = authService;
		this.authIdentityRepository = authIdentityRepository;
	}

	async init(): Promise<void> {
		try {
			if (getOidcEnabled()) {
				await this.initClient();
			}
		} catch (error) {
			this.logger.error(
				`OIDC initialization failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async initClient(): Promise<void> {
		const issuerUrl = getOidcIssuerUrl() || '';
		const clientId = process.env.N8N_OIDC_CLIENT_ID || getOidcClientId();
		const clientSecret = process.env.N8N_OIDC_CLIENT_SECRET || getOidcClientSecret();
		const redirectUri = process.env.N8N_OIDC_REDIRECT_URL || getOidcRedirectUri();

		if (!issuerUrl || !clientId) {
			this.logger.debug('OIDC not configured; issuerUrl or clientId missing', {
				issuerUrl,
				clientId,
			});
			return;
		}

		try {
			// Load the module
			const openid = require('openid-client');
			this.logger.debug('openid-client exports', {
				keys: Object.keys(openid).filter((k) => !k.startsWith('_')),
			});

			// Store PKCE generator functions
			this.generators = {
				codeVerifier: openid.randomPKCECodeVerifier,
				codeChallenge: openid.calculatePKCECodeChallenge,
				nonce: openid.randomNonce,
				state: openid.randomState,
			};

			// Verify all required functions exist
			if (!this.generators.codeVerifier || !openid.discovery || !openid.buildAuthorizationUrl) {
				throw new Error('Required openid-client functions missing');
			}

			try {
				// Use discovery function to get config following official pattern
				this.logger.debug(`Discovering OIDC issuer: ${issuerUrl}`);
				const config = await openid.discovery(new URL(issuerUrl), clientId, clientSecret);

				// Store the config for later use
				this.oidcConfig = config;

				this.logger.debug('OIDC issuer metadata retrieved', {
					issuer: config.serverMetadata().issuer,
					endpoints: {
						auth: !!config.serverMetadata().authorization_endpoint,
						token: !!config.serverMetadata().token_endpoint,
						userinfo: !!config.serverMetadata().userinfo_endpoint,
					},
				});

				// Create helper methods that match our existing interface
				this.oidcClient = {
					// Generate authorization URL with PKCE
					authorizationUrl: (options: any) => {
						// Log the incoming parameters for debugging
						this.logger.debug('Authorization URL parameters', {
							code_challenge_length: options.code_challenge?.length,
							state_length: options.state?.length,
							nonce_length: options.nonce?.length,
						});

						const parameters: Record<string, string> = {
							redirect_uri: redirectUri,
							scope: 'openid email profile',
							code_challenge: options.code_challenge,
							code_challenge_method: 'S256',
							state: options.state,
							nonce: options.nonce,
						};

						const redirectTo = openid.buildAuthorizationUrl(config, parameters);
						this.logger.debug('Generated authorization URL', { url: redirectTo.href });
						return redirectTo.href;
					},

					// Handle callback with authorization code
					callback: async (redirectUri: string, params: any, checks: any) => {
						if (!params.code) {
							throw new Error('Authorization code missing');
						}

						// Create a URL object from the current request
						const currentUrl = new URL(`${redirectUri}?${new URLSearchParams(params).toString()}`);

						try {
							// Exchange code for tokens using official method
							const tokens = await openid.authorizationCodeGrant(config, currentUrl, {
								pkceCodeVerifier: checks.code_verifier,
								expectedNonce: checks.nonce,
								expectedState: checks.state,
								idTokenExpected: true,
							});

							// Get user info if needed
							if (tokens.access_token) {
								try {
									const claims = tokens.claims();
									const sub = claims?.sub;

									if (sub) {
										const userInfo = await openid.fetchUserInfo(config, tokens.access_token, sub);
										tokens.userinfo = userInfo;
									}
								} catch (error) {
									this.logger.warn('Failed to fetch userinfo', {
										error: error instanceof Error ? error.message : String(error),
									});
								}
							}

							return tokens;
						} catch (error) {
							this.logger.error('Token exchange failed', {
								error: error instanceof Error ? error.message : String(error),
								stack: error instanceof Error ? error.stack : undefined,
							});
							throw error;
						}
					},
				};

				this.logger.debug('OIDC client initialized successfully using official pattern');
			} catch (discoveryError) {
				this.logger.error('OIDC discovery error', {
					issuerUrl,
					error: discoveryError instanceof Error ? discoveryError.message : String(discoveryError),
				});
				throw discoveryError;
			}
		} catch (error) {
			this.logger.error('OIDC initialization error', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
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
		return getOidcEnabled();
	}

	shouldRedirectLoginToSso(): boolean {
		return this.getConfigPreferences().redirectLoginToSso && this.isOidcLoginEnabled();
	}

	isInitialized(): boolean {
		return this.oidcClient !== null;
	}

	async generateAuthorizationUrl(): Promise<string> {
		if (!this.isInitialized()) {
			throw new BadRequestError('OIDC client not initialized');
		}

		// Generate PKCE and state parameters
		this.pkceVerifier = this.generators.codeVerifier();
		this.nonce = this.generators.nonce();
		this.state = this.generators.state();

		// Ensure we have valid parameters
		if (!this.pkceVerifier || !this.nonce || !this.state) {
			throw new Error('Failed to generate PKCE parameters');
		}

		// Calculate code challenge with await to ensure it's properly generated
		const codeChallenge = await this.generators.codeChallenge(this.pkceVerifier);

		this.logger.debug('PKCE parameters generated', {
			verifierLength: this.pkceVerifier.length,
			challengeLength: codeChallenge.length,
			nonceLength: this.nonce.length,
			stateLength: this.state.length,
		});

		return this.oidcClient.authorizationUrl({
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			nonce: this.nonce,
			state: this.state,
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
			// Log callback parameters for debugging
			this.logger.debug('OIDC callback parameters received', {
				params: callbackParams,
				code_exists: !!callbackParams.code,
				state_exists: !!callbackParams.state,
				error: callbackParams.error || 'none',
			});

			// Get redirect URI from config and use it exactly as configured
			// It MUST match what was registered with the identity provider
			const redirectUri = this.getConfigPreferences().redirectUri;
			this.logger.debug('OIDC redirect URI from config', { redirectUri });

			// IMPORTANT: We must use the exact same redirect URI that was registered with
			// the identity provider during the token exchange, or it will be rejected
			this.logger.debug('Using original redirect URI for token exchange', { redirectUri });

			const tokenSet = await this.oidcClient.callback(redirectUri, callbackParams, {
				code_verifier: this.pkceVerifier!,
				nonce: this.nonce!,
				state: this.state!,
			});

			// Log token details for debugging (excluding sensitive data)
			this.logger.debug('OIDC token received', {
				hasAccessToken: !!tokenSet.access_token,
				hasIdToken: !!tokenSet.id_token,
				hasRefreshToken: !!tokenSet.refresh_token,
				expiresIn: tokenSet.expires_in || 'unknown',
			});

			this.pkceVerifier = null;
			this.nonce = null;
			this.state = null;

			return tokenSet;
		} catch (error) {
			this.logger.error(
				`OIDC callback error: ${error instanceof Error ? error.message : String(error)}`,
				{
					stack: error instanceof Error ? error.stack : undefined,
				},
			);
			throw new BadRequestError('OIDC callback failed');
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
			relations: ['user', 'user.authIdentities'],
		});
		if (identity) {
			return { user: identity.user, isNew: false };
		}

		// 2. Fallback: find user by email claim
		const email = claims.email as string;
		if (email) {
			const user = await this.userRepository.findOne({
				where: { email },
				relations: ['authIdentities'],
			});
			if (user) {
				const newIdentity = AuthIdentity.create(user, subject, 'oidc');
				await this.authIdentityRepository.save(newIdentity);
				return { user, isNew: false };
			}
		}

		// 3. JIT provisioning
		if (getOidcJitProvisioning()) {
			const userData: any = {
				email: email || `${subject}@oidc.user`,
				firstName: (claims.name as string)?.split(' ')[0] || '',
				lastName: (claims.name as string)?.split(' ').slice(1).join(' ') || '',
				// Set default role - required field in User entity
				role: 'global:member',
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

interface OidcPreferences {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scopes: string[];
	jitProvisioning: boolean;
	redirectLoginToSso: boolean;
}
