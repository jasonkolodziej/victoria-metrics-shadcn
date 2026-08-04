import { env } from '$env/dynamic/private';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Handle } from '@sveltejs/kit';

// RFC 8707 §2: the resource server validates that the token's `aud` matches its
// own identifier. Cloudflare Access uses an opaque AUD tag rather than a URI
// resource indicator, so strict §2 URI matching is not possible, but signature
// verification + issuer + audience check satisfies the intent.
//
// Only active when CLOUDFLARE_TEAM_DOMAIN + CLOUDFLARE_ACCESS_AUD are set.
// Local dev (no vars) passes through without enforcement.

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!jwks) {
        // jose caches the JWKS internally and re-fetches on kid miss — no manual
        // rotation handling needed.
        jwks = createRemoteJWKSet(
            new URL(
                `https://${env.CLOUDFLARE_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`
            )
        );
    }
    return jwks;
}

export const handle: Handle = async ({ event, resolve }) => {
    if (!env.CLOUDFLARE_TEAM_DOMAIN || !env.CLOUDFLARE_ACCESS_AUD) {
        return resolve(event);
    }

    const token = event.request.headers.get('cf-access-jwt-assertion');
    if (!token) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { payload } = await jwtVerify(token, getJwks(), {
            issuer: `https://${env.CLOUDFLARE_TEAM_DOMAIN}.cloudflareaccess.com`,
            audience: env.CLOUDFLARE_ACCESS_AUD,
        });
        event.locals.user = {
            email: payload['email'] as string,
            sub: payload.sub as string,
        };
    } catch {
        return new Response('Unauthorized', { status: 401 });
    }

    return resolve(event);
};
