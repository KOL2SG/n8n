import { Request, Response, Router } from 'express';
import { Logger } from 'n8n-core';
import { Container } from '@n8n/di';
import { AuthService } from '@/auth/auth.service';
import { UrlService } from '@/services/url.service';

import { OidcServiceCC } from './oidc.service.cc';
import config from '@/config';

/**
 * OIDC Express router and controller (Community edition)
 */
export class OidcControllerCC {
	private readonly router = Router();

	constructor(
		private readonly logger: Logger,
		private readonly oidcService: OidcServiceCC,
		private readonly authService: AuthService,
		private readonly urlService: UrlService,
	) {
		this.router.get('/login', this.login.bind(this));
		this.router.get('/callback', this.callback.bind(this));
	}

	getRouter(): Router {
		return this.router;
	}

	async login(req: Request, res: Response): Promise<void> {
		try {
			// Check if OIDC is enabled via feature flag
			if (!config.getEnv('sso.oidcEnabled')) {
				this.logger.debug('OIDC login attempted but feature is disabled');
				return res.redirect(this.urlService.getInstanceBaseUrl() + '/signin');
			}

			// Generate authorization URL and redirect to the identity provider
			const authorizationUrl = this.oidcService.generateAuthorizationUrl();
			return res.redirect(authorizationUrl);
		} catch (error) {
			this.logger.error(
				`Failed to generate OIDC authorization URL: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return res.redirect(this.urlService.getInstanceBaseUrl() + '/signin?error=oidc_error');
		}
	}

	async callback(req: Request, res: Response): Promise<void> {
		try {
			// Check if OIDC is enabled via feature flag
			if (!config.getEnv('sso.oidcEnabled')) {
				this.logger.debug('OIDC callback received but feature is disabled');
				return res.redirect(this.urlService.getInstanceBaseUrl() + '/signin');
			}

			// Handle the callback from the identity provider
			const tokenSet = await this.oidcService.handleCallback(req.query);

			// Find or create the user based on the token
			const { user } = await this.oidcService.findOrCreateUserByTokenSet(tokenSet);

			if (!user) {
				throw new Error('Failed to find or create user from OIDC token');
			}

			// Log the user in
			await this.authService.issueJWT(user, res);

			// Redirect to the instance base URL
			return res.redirect(this.urlService.getInstanceBaseUrl());
		} catch (error) {
			this.logger.error(
				`OIDC authentication failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return res.redirect(
				this.urlService.getInstanceBaseUrl() + '/signin?error=oidc_authentication_failed',
			);
		}
	}
}

// Factory function to create and register the controller
export function registerOidcController(app: any): void {
	const controller = new OidcControllerCC(
		Container.get(Logger),
		Container.get(OidcServiceCC),
		Container.get(AuthService),
		Container.get(UrlService),
	);

	app.use('/sso/oidc', controller.getRouter());
}
