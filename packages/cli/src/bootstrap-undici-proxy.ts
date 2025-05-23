console.log('[bootstrap-undici-proxy] initializing...');

// Undici is used by openid-client and other modern Node.js libraries
// This file configures undici to use the same proxy settings as the rest of n8n

// Import undici's ProxyAgent
import { ProxyAgent } from 'undici';
import { setGlobalDispatcher } from 'undici';

// Get proxy URL from various possible sources
const proxyUrl =
	process.env.GLOBAL_AGENT_HTTP_PROXY ||
	(global as any).GLOBAL_AGENT?.HTTP_PROXY ||
	process.env.HTTP_PROXY ||
	process.env.http_proxy ||
	process.env.HTTPS_PROXY ||
	process.env.https_proxy;

// Log the proxy configuration
console.log('[bootstrap-undici-proxy] proxy settings:', {
	proxyUrl,
	globalAgentProxy: (global as any).GLOBAL_AGENT?.HTTP_PROXY,
	envProxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
});

// If proxy is configured, create and set global ProxyAgent for undici
if (proxyUrl) {
	console.log(`[bootstrap-undici-proxy] configuring undici with proxy: ${proxyUrl}`);

	// Create a ProxyAgent with the proxy URL
	const proxyAgent = new ProxyAgent({
		uri: proxyUrl,
		// Allow self-signed certificates in development
		...(process.env.NODE_ENV === 'development'
			? {
					requestTls: { rejectUnauthorized: false },
					proxy: { rejectUnauthorized: false },
				}
			: {}),
	});

	// Set as global dispatcher for all undici requests
	setGlobalDispatcher(proxyAgent);

	console.log('[bootstrap-undici-proxy] undici proxy configuration complete');
} else {
	console.log('[bootstrap-undici-proxy] no proxy configuration found, using default settings');
}
