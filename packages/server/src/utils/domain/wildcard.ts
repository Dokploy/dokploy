/**
 * Check if a domain is a wildcard domain (starts with *.)
 */
export const isWildcardDomain = (domain: string): boolean => {
	return domain.trim().startsWith("*.");
};

/**
 * Extract the base domain from a wildcard domain
 * Example: *.example.com -> example.com
 */
export const extractBaseDomain = (wildcardDomain: string): string | null => {
	if (!isWildcardDomain(wildcardDomain)) {
		return null;
	}
	return wildcardDomain.trim().substring(2);
};

/**
 * Check if a domain matches a wildcard pattern
 * Example: app1.example.com matches *.example.com
 */
export const matchesWildcard = (domain: string, wildcardPattern: string): boolean => {
	if (!isWildcardDomain(wildcardPattern)) {
		return false;
	}
	
	const baseDomain = extractBaseDomain(wildcardPattern);
	if (!baseDomain) {
		return false;
	}
	
	const trimmedDomain = domain.trim();
	
	// Exact match with base domain
	if (trimmedDomain === baseDomain) {
		return true;
	}
	
	// Check if domain ends with .baseDomain
	if (trimmedDomain.endsWith("." + baseDomain)) {
		// Ensure it's not a nested match (e.g., example.com.example.com)
		const prefix = trimmedDomain.substring(0, trimmedDomain.length - baseDomain.length - 1);
		// Prefix should be a valid subdomain (non-empty, no dots at start/end)
		return prefix.length > 0 && !prefix.startsWith(".") && !prefix.endsWith(".");
	}
	
	return false;
};

/**
 * Find all wildcard patterns that match a given domain
 */
export const findMatchingWildcards = (
	domain: string,
	wildcardPatterns: string[],
): string[] => {
	return wildcardPatterns.filter((pattern) => matchesWildcard(domain, pattern));
};

/**
 * Convert a wildcard domain to a Traefik HostRegexp rule
 * Example: *.example.com -> HostRegexp(`^[^.]+\.example\.com$`)
 */
export const wildcardToHostRegexp = (wildcardDomain: string): string => {
	if (!isWildcardDomain(wildcardDomain)) {
		return `Host(\`${wildcardDomain}\`)`;
	}
	
	const baseDomain = extractBaseDomain(wildcardDomain);
	if (!baseDomain) {
		return `Host(\`${wildcardDomain}\`)`;
	}
	
	// Escape dots in the base domain for regex
	const escapedBase = baseDomain.replace(/\./g, "\\.");
	
	// Create regex pattern: ^[^.]+\.example\.com$
	// This matches any subdomain of example.com but not example.com itself
	// To also match the base domain, we could use: ^([^.]+\.)?example\.com$
	return `HostRegexp(\`^[^.]+\\\\.${escapedBase}$\`)`;
};

/**
 * Convert a wildcard domain to a Traefik HostRegexp rule that also matches the base domain
 * Example: *.example.com -> HostRegexp(`^([^.]+\.)?example\.com$`)
 */
export const wildcardToHostRegexpWithBase = (wildcardDomain: string): string => {
	if (!isWildcardDomain(wildcardDomain)) {
		return `Host(\`${wildcardDomain}\`)`;
	}
	
	const baseDomain = extractBaseDomain(wildcardDomain);
	if (!baseDomain) {
		return `Host(\`${wildcardDomain}\`)`;
	}
	
	// Escape dots in the base domain for regex
	const escapedBase = baseDomain.replace(/\./g, "\\.");
	
	// Create regex pattern that matches both subdomains and base domain
	// ^([^.]+\.)?example\.com$ matches:
	// - example.com (base domain)
	// - app1.example.com (subdomain)
	// - app2.example.com (subdomain)
	return `HostRegexp(\`^([^.]+\\\\.)?${escapedBase}$\`)`;
};

