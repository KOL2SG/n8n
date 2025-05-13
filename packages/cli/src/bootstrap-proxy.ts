console.log('[bootstrap-proxy] interceptor loaded');
import 'global-agent/bootstrap';
import axios from 'axios';

console.error(
	'[bootstrap-proxy] env HTTP_PROXY=',
	process.env.HTTP_PROXY,
	'HTTPS_PROXY=',
	process.env.HTTPS_PROXY,
	'GLOBAL_AGENT.HTTP_PROXY=',
	(global as any).GLOBAL_AGENT?.HTTP_PROXY,
);

axios.interceptors.request.use((config) => {
	console.error(
		'[bootstrap-proxy] about to send:',
		config.method?.toUpperCase(),
		config.url,
		'via proxy?',
		!!process.env.HTTPS_PROXY,
		'customAgent?',
		!!(config as any).httpsAgent,
	);
	// if someone's set a core HTTPS.Agent that isn't for skip-SSL, drop it
	const agent = (config as any).httpsAgent;
	if (agent instanceof require('https').Agent && agent.options.rejectUnauthorized !== false) {
		delete (config as any).httpsAgent;
	}
	delete (config as any).httpAgent;
	return config;
});
