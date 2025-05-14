console.log('[bootstrap-proxy] interceptor loaded');
import 'global-agent/bootstrap';

console.error(
	'[bootstrap-proxy] env HTTP_PROXY=',
	process.env.HTTP_PROXY,
	'HTTPS_PROXY=',
	process.env.HTTPS_PROXY,
	'GLOBAL_AGENT.HTTP_PROXY=',
	(global as any).GLOBAL_AGENT?.HTTP_PROXY,
);
