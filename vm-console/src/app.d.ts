declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Populated by hooks.server.ts when CLOUDFLARE_TEAM_DOMAIN is set. */
			user?: { email: string; sub: string };
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
