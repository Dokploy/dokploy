/**
 * Generates a Traefik routing rule for the given host.
 *
 * For regular domains: uses Host(`domain.com`)
 * For wildcard domains (*.domain.com): uses HostRegexp(`.+\.domain\.com`)
 *
 * Traefik v3 changed the syntax for wildcard routing:
 * - v2 used: HostRegexp({subdomain:[a-z]+}.domain.com)
 * - v3 uses: HostRegexp(`.+\.domain\.com`)
 *
 * @see https://doc.traefik.io/traefik/v3.0/routing/routers/
 * @see https://community.traefik.io/t/how-to-create-a-router-rule-for-a-wildcard/19850
 */
export const generateTraefikHostRule = (host: string): string => {
	if (host.startsWith("*.")) {
		// Wildcard domain: *.example.com -> HostRegexp(`.+\.example\.com`)
		const baseDomain = host.slice(2); // Remove "*."
		// Escape dots in the domain for regex
		const escapedDomain = baseDomain.replace(/\./g, "\\.");
		return `HostRegexp(\`^.+\\.${escapedDomain}$\`)`;
	}

	// Regular domain: use Host() matcher
	return `Host(\`${host}\`)`;
};

/**
 * Checks if the given host is a wildcard domain (starts with *.)
 */
export const isWildcardDomain = (host: string): boolean => {
	return host.startsWith("*.");
};
