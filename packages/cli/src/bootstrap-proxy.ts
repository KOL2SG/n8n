console.log('[bootstrap-proxy] interceptor loaded');
import 'global-agent/bootstrap';

console.log('[bootstrap-proxy] proxy settings status:', {
	envHttpProxy: process.env.HTTP_PROXY ? 'set' : 'undefined',
	envHttpsProxy: process.env.HTTPS_PROXY ? 'set' : 'undefined',
	globalAgentProxy: (global as any).GLOBAL_AGENT?.HTTP_PROXY ? 'set' : 'undefined',
});
