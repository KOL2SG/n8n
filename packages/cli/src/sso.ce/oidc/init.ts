import { Container } from '@n8n/di';
import { Logger } from 'n8n-core';
import type { Application } from 'express';

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

	// Debug logging for all environment variables related to OIDC
	logger.debug('OIDC environment variables:', {
		ssoOidcEnabled: process.env.N8N_SSO_OIDC_ENABLED,
		issuerUrl: process.env.N8N_OIDC_ISSUER_URL,
		clientId: process.env.N8N_OIDC_CLIENT_ID,
	});

	// Check if OIDC is enabled via feature flag
	const oidcEnabled = getOidcEnabled();
	logger.debug('OIDC enabled check result:', { oidcEnabled });

	// Skip if OIDC is not explicitly enabled
	if (!oidcEnabled) {
		logger.debug('OIDC is not enabled via environment variables, skipping initialization');
		return;
	}

	logger.debug('OIDC is enabled, starting initialization');

	try {
		// Initialize OIDC service
		const oidcService = Container.get(OidcServiceCE);

		// Initialize the client (load openid-client, discover endpoints, etc.)
		await oidcService.init();

		// The @RestController decorator automatically registers the controller
		// with n8n's controller registry system - no manual registration needed
		logger.debug('OIDC SSO (Community Edition) initialized successfully');
	} catch (error) {
		logger.error(
			`Failed to initialize OIDC service: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
