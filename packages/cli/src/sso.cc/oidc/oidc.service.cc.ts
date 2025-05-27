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
import * as crypto from 'crypto';

@Service()
export class OidcServiceCE {
	private readonly logger: Logger;
	private pkceVerifier: string | null = null;
	private nonce: string | null = null;
	private state: string | null = null;
	private oidcClient: any | null = null;
	private generators: any;
	// Configuration obtained during discovery
	private readonly userRepository: UserRepository;
	// These are declared but currently unused - keeping for future extensibility
	// private readonly settingsRepository: SettingsRepository;
	// private readonly authService: AuthService;
	private readonly authIdentityRepository: AuthIdentityRepository;

	constructor(
		logger: Logger,
		userRepository: UserRepository,
		_settingsRepository: SettingsRepository,
		_authService: AuthService,
		authIdentityRepository: AuthIdentityRepository,
	) {
		this.logger = logger;
		this.userRepository = userRepository;
		// These services are injected but not currently used
		// Will be used in future extensions
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
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const globalAgent = require('global-agent');

			this.logger.debug('openid-client exports', {
				keys: Object.keys(openid).filter((k) => !k.startsWith('_')),
			});

			// Get the existing global-agent HTTP/HTTPS agents
			const httpAgent = globalAgent.globals?.httpAgent;
			const httpsAgent = globalAgent.globals?.httpsAgent;

			// Configure proxy for openid-client requests
			if (httpAgent || httpsAgent) {
				this.logger.debug('Found global-agent proxy agents', {
					hasHttpAgent: !!httpAgent,
					hasHttpsAgent: !!httpsAgent,
				});

				// Configure the openid-client to use the global-agent HTTP agents
				openid.custom.setHttpOptionsDefaults({
					...(httpAgent ? { httpAgent } : {}),
					...(httpsAgent ? { httpsAgent } : {}),
					// For development environments, allow self-signed certificates
					...(process.env.NODE_ENV === 'development' ? { rejectUnauthorized: false } : {}),
				});

				this.logger.debug('Applied global-agent HTTP agents to openid-client');
			} else {
				this.logger.debug('No global-agent HTTP agents found, using default configuration');
				// Allow insecure requests in development
				if (process.env.NODE_ENV === 'development') {
					this.logger.debug('Setting TLS reject unauthorized to false for development');
					openid.custom.setHttpOptionsDefaults({
						rejectUnauthorized: false,
					});
				}
			}

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

				// Config is stored in local variables and accessed via helper methods
				// No need to store the whole config object

				this.logger.debug('OIDC issuer metadata retrieved', {
					issuer: config.serverMetadata().issuer,
					endpoints: {
						auth: !!config.serverMetadata().authorization_endpoint,
						token: !!config.serverMetadata().token_endpoint,
						userinfo: !!config.serverMetadata().userinfo_endpoint,
					},
				});

				// Store discovery configuration in structured debug log
				this.logger.debug('OIDC discovery complete', {
					clientId: config.clientId,
					authUrl: config.serverMetadata().authorization_endpoint,
					tokenUrl: config.serverMetadata().token_endpoint,
					jwksUrl: config.serverMetadata().jwks_uri,
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

	/**
	 * Extract first and last name from OIDC claims
	 */
	private extractNameFromClaims(claims: any): { firstName: string; lastName: string } {
		let firstName = '';
		let lastName = '';

		// First try to use given_name and family_name if available (most accurate)
		if (claims.given_name || claims.family_name) {
			firstName = claims.given_name || '';
			lastName = claims.family_name || '';
		}
		// Fall back to splitting the name field if available
		else if (claims.name) {
			const nameParts = (claims.name as string).split(' ');
			firstName = nameParts[0] || '';
			lastName = nameParts.slice(1).join(' ') || '';
		}

		return { firstName, lastName };
	}

	/**
	 * Update an existing user with information from OIDC claims
	 */
	private async updateUserFromClaims(user: User, claims: any): Promise<User> {
		let isChanged = false;
		const { firstName, lastName } = this.extractNameFromClaims(claims);

		// Only update if SSO provides these values and they differ from what we have
		if (firstName && firstName !== user.firstName) {
			user.firstName = firstName;
			isChanged = true;
		}

		if (lastName && lastName !== user.lastName) {
			user.lastName = lastName;
			isChanged = true;
		}

		// Ensure user is not pending by setting a random password if null
		// This addresses the User.isPending computed property that checks for null password
		if (user.password === null) {
			// Generate a random string that won't be used (SSO users authenticate via SSO)
			user.password = this.generateRandomPassword();
			isChanged = true;
			this.logger.debug('Setting random password for SSO user to prevent pending status', {
				userId: user.id,
			});
		}

		if (isChanged) {
			await this.userRepository.save(user);
			this.logger.debug('Updated user information from OIDC claims', {
				userId: user.id,
				email: user.email,
			});
		}

		return user;
	}

	/**
	 * Generate a random password for SSO users to prevent them from showing as "pending"
	 */
	private generateRandomPassword(): string {
		// This password will never be used, but prevents the user from being marked as "pending"
		// It's a random string that is hashed before storage
		return Buffer.from(crypto.randomBytes(32)).toString('hex');
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

		// 1. Try to find user by OIDC subject (most reliable method)
		const identity = await this.authIdentityRepository.findOne({
			where: { providerId: subject, providerType: 'oidc' },
			relations: ['user'],
		});

		if (identity?.user) {
			// Update user information from OIDC claims
			const updatedUser = await this.updateUserFromClaims(identity.user, claims);
			return { user: updatedUser, isNew: false };
		}

		// 2. Try email-based user lookup as fallback
		if (claims.email) {
			// Try to find user by email as a fallback
			const user = await this.userRepository.findOne({
				where: { email: claims.email },
			});

			if (user) {
				this.logger.debug('Found existing user by email, creating OIDC identity', {
					email: claims.email,
					userId: user.id,
				});

				// Update user with OIDC claims data
				const updatedUser = await this.updateUserFromClaims(user, claims);

				// Create auth identity to link user to OIDC
				const newIdentity = AuthIdentity.create(updatedUser, subject, 'oidc');
				await this.authIdentityRepository.save(newIdentity);
				return { user: updatedUser, isNew: false };
			}
		}

		// 3. JIT provisioning
		if (getOidcJitProvisioning()) {
			this.logger.debug('Creating new user via OIDC JIT provisioning', {
				email: claims.email,
				subject,
				hasName: !!claims.name,
			});

			// Extract name from claims using the dedicated method
			const { firstName, lastName } = this.extractNameFromClaims(claims);

			// Prepare user data for creation
			const userData: DeepPartial<User> = {
				email: claims.email || `${subject}@oidc.user`,
				firstName,
				lastName,
				role: 'global:member',
				settings: { userActivated: true },
				// Add a random password to prevent user from being marked as "pending"
				password: this.generateRandomPassword(),
			};

			// Use helper to also create the user's personal project + relation
			const { user: newUser } = await this.userRepository.createUserWithProject(userData);

			// Double-check that the user is actually activated after saving
			if (!newUser.settings?.userActivated) {
				this.logger.warn(
					'User created via JIT was not activated automatically, forcing activation',
					{
						userId: newUser.id,
						email: newUser.email,
					},
				);

				// Force activation if somehow the user was still created as inactive
				if (!newUser.settings) {
					newUser.settings = {};
				}
				newUser.settings.userActivated = true;
				await this.userRepository.save(newUser);
			}

			const newIdentity = AuthIdentity.create(newUser, subject, 'oidc');
			await this.authIdentityRepository.save(newIdentity);

			this.logger.debug('Successfully created and activated new user via OIDC', {
				userId: newUser.id,
				email: newUser.email,
				isActivated: newUser.settings?.userActivated,
			});

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
