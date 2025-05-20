/**
 * Type declarations for openid-client (v6 ESM-only package)
 */
declare module 'openid-client' {
	export class Issuer {
		static discover(issuerUrl: string): Promise<any>;
	}
	export interface Generators {
		codeVerifier(): string;
		codeChallenge(verifier: string): string;
		nonce(): string;
		state(): string;
	}
	export const generators: Generators;
	export class Client {
		constructor(options: {
			client_id: string;
			client_secret: string;
			redirect_uris: string[];
			response_types: string[];
		});
		authorizationUrl(opts: Record<string, any>): string;
		callback(...args: any[]): Promise<any>;
	}
}
