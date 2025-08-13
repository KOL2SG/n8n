import { Get, RestController } from '@n8n/decorators';
import { Container } from '@n8n/di';
import { Response } from 'express';

import { Logger } from '@n8n/backend-common';
import { AuthService } from '@/auth/auth.service';

import type { AuthenticatedRequest } from '@/requests';

import { OidcServiceCE } from './oidc.service';

/**
 * Controller for OIDC authentication (Community Edition)
 * Provides endpoints for initiating login and handling callbacks
 */
@RestController('/sso/oidc')
export class OidcControllerCE {
	private oidcService = Container.get(OidcServiceCE);
	private readonly logger = Container.get(Logger);
	private readonly authService = Container.get(AuthService);

	/**
	 * Initiates OIDC login flow
	 * Redirects to the OIDC provider's login page
	 */
	@Get('/login', { skipAuth: true })
	async login(_req: AuthenticatedRequest, res: Response): Promise<void> {
		this.logger.debug('OIDC Login Flow - Step 1: Login endpoint called');
		try {
			// Log config info for debugging
			const config = this.oidcService.getConfigPreferences();
			// Log each configuration item separately to avoid type errors
			this.logger.debug('OIDC Configuration - Issuer URL:', { issuerUrlSet: !!config.issuerUrl });
			this.logger.debug('OIDC Configuration - Redirect URI:', {
				redirectUriSet: !!config.redirectUri,
			});

			// Handle scopes separately to avoid type errors
			const scopesString = Array.isArray(config.scopes)
				? config.scopes.join(' ')
				: typeof config.scopes === 'string'
					? config.scopes
					: 'none';
			this.logger.debug('OIDC Configuration - Scopes:', { value: scopesString });

			this.logger.debug('OIDC Configuration - JIT Provisioning:', {
				enabled: config.jitProvisioning,
			});

			// Generate authorization URL using the service method
			this.logger.debug('OIDC Login Flow - Step 2: Generating authorization URL with PKCE');
			const redirectUrl = await this.oidcService.generateAuthorizationUrl();

			this.logger.debug('OIDC Login Flow - Step 3: Redirecting to identity provider', {
				redirectUrl,
			});
			return res.redirect(redirectUrl);
		} catch (error) {
			this.logger.error('OIDC Login Flow - Error in login endpoint', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			if (error instanceof Error) {
				res.status(400).send({
					error: error.message,
					status: 'error',
				});
			} else {
				res.status(500).send({
					error: 'Unknown error during OIDC login',
					status: 'error',
				});
			}
		}
	}

	/**
	 * Handles callback from OIDC provider
	 * Processes authentication response and logs the user in
	 */
	@Get('/callback', { skipAuth: true })
	async callback(req: AuthenticatedRequest, res: Response): Promise<void> {
		// Cast query parameters with proper type handling
		const query = req.query as Record<string, string | string[]>;
		this.logger.debug('OIDC Login Flow - Step 4: Callback endpoint called', {
			query,
			hasCode: 'code' in query,
			hasState: 'state' in query,
			hasError: 'error' in query,
		});

		try {
			// Exchange the authorization code for tokens
			this.logger.debug('OIDC Login Flow - Step 5: Exchanging auth code for tokens');
			// Pass query parameters to handleCallback, ensuring proper type compatibility
			const tokenSet = await this.oidcService.handleCallback(query);
			this.logger.debug('OIDC Login Flow - Step 6: Token exchange successful', {
				hasAccessToken: !!tokenSet.access_token,
				hasIdToken: !!tokenSet.id_token,
				expiresIn: tokenSet.expires_in || 'unknown',
			});

			// Find or create user based on the token set
			this.logger.debug('OIDC Login Flow - Step 7: Finding or creating user');
			const { user, isNew } = await this.oidcService.findOrCreateUserByTokenSet(tokenSet);
			this.logger.debug('OIDC Login Flow - Step 8: User resolution complete', {
				userId: user.id,
				email: user.email,
				isNewUser: isNew,
				isActive: user.isActive,
				role: user.role,
			});

			// Step 9: Establish session by issuing authentication cookie
			this.logger.debug('OIDC Login Flow - Step 9: Establishing user session');
			// Get browserId from request if available
			const browserId = (req as any).browserId;
			// Issue cookie to establish session
			this.authService.issueCookie(res, user, browserId);
			this.logger.debug('OIDC Login Flow - Step 10: Session established, redirecting to main app');

			// Redirect to the main application
			return res.redirect('/');
		} catch (error) {
			this.logger.error('OIDC Login Flow - Error in callback endpoint', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			if (error instanceof Error) {
				res.status(400).send({
					error: error.message,
					status: 'error',
				});
			} else {
				res.status(500).send({
					error: 'Unknown error during OIDC callback processing',
					status: 'error',
				});
			}
		}
	}
}
