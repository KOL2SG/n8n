import { Container } from '@n8n/di';
import { Logger } from 'n8n-core';
import { Application } from 'express';

import { OidcServiceCC } from './oidc.service';
import { registerOidcController } from './oidc.controller';
import { getOidcEnabled } from '../utils/config-helper';

/**
 * Initialize OIDC service and register OIDC controller routes
 */
export async function initializeOidcService(app: Application): Promise<void> {
	// Skip if OIDC is not enabled
	if (!getOidcEnabled()) {
		return;
	}

	const logger = Container.get(Logger);

	try {
		// Initialize OIDC service
		const oidcService = Container.get(OidcServiceCC);

		// Initialize the client (load openid-client, discover endpoints, etc.)
		await oidcService.init();

		// Register OIDC controller routes
		registerOidcController(app);

		logger.debug('OIDC service initialized and routes registered');
	} catch (error) {
		logger.error(
			`Failed to initialize OIDC service: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
