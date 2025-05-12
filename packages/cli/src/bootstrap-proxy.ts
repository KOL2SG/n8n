console.log('[bootstrap-proxy] interceptor loaded');
import 'global-agent/bootstrap';
import axios from 'axios';

axios.interceptors.request.use((config) => {
	// if someone's set a core HTTPS.Agent that isn't for skip-SSL, drop it
	const agent = (config as any).httpsAgent;
	if (agent instanceof require('https').Agent && agent.options.rejectUnauthorized !== false) {
		delete (config as any).httpsAgent;
	}
	return config;
});
