import { Container } from '@n8n/di';
import type { Application } from 'express';
import { Logger } from '@n8n/backend-common';

import { OidcServiceCE } from './oidc.service';
// The import of the controller is enough for n8n's decorator system to register it
// because it uses the @RestController decorator
import './oidc.controller';
import { getOidcEnabled } from '../utils/config-helper';

/**
 * Initialize OIDC service and register OIDC controller routes
 * Only initializes if OIDC is explicitly enabled via environment variables
 *
 * @param app - Express application instance (required for compatibility with server.ts,
 *              but not directly used since @RestController handles registration)
 */
export async function initializeOidcService(_app: Application): Promise<void> {
	const logger = Container.get(Logger);

	try {
		// Debug logging for all environment variables related to OIDC
		logger.debug('OIDC: Checking environment variables...', {
			N8N_SSO_OIDC_ENABLED: process.env.N8N_SSO_OIDC_ENABLED,
			N8N_OIDC_ISSUER_URL: process.env.N8N_OIDC_ISSUER_URL ? '***redacted***' : 'not set',
			N8N_OIDC_CLIENT_ID: process.env.N8N_OIDC_CLIENT_ID ? '***redacted***' : 'not set',
			N8N_OIDC_CLIENT_SECRET: process.env.N8N_OIDC_CLIENT_SECRET ? '***redacted***' : 'not set',
			N8N_OIDC_REDIRECT_URL: process.env.N8N_OIDC_REDIRECT_URL || 'not set',
			N8N_OIDC_SCOPES: process.env.N8N_OIDC_SCOPES || 'not set',
			N8N_OIDC_REDIRECT_LOGIN_TO_SSO: process.env.N8N_OIDC_REDIRECT_LOGIN_TO_SSO || 'not set',
		});

		// Check if OIDC is enabled via feature flag
		const oidcEnabled = getOidcEnabled();
		logger.debug('OIDC: Feature flag check result:', { oidcEnabled });

		// Skip if OIDC is not explicitly enabled
		if (!oidcEnabled) {
			logger.debug('OIDC: Not enabled via feature flag, skipping initialization');
			return;
		}

		logger.debug('OIDC: Feature flag enabled, proceeding with initialization');

		try {
			logger.debug('OIDC: Creating OIDC service instance...');
			const oidcService = Container.get(OidcServiceCE);

			// Initialize the client (load openid-client, discover endpoints, etc.)
			logger.debug('OIDC: Initializing OIDC client...');
			await oidcService.init();

			// The @RestController decorator automatically registers the controller
			// with n8n's controller registry system - no manual registration needed
			logger.debug('OIDC: SSO (Community Edition) initialized successfully');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`OIDC: Failed to initialize service: ${errorMessage}`, {
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Don't rethrow to prevent server crash, just log the error
		}
	} catch (error) {
		logger.error('OIDC: Unexpected error during initialization', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
	}
}
