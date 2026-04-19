import { getWebServerSettings } from "../services/web-server-settings";

/**
 * Extracts the base domain from a wildcard pattern.
 * @example extractBaseDomain("*.example.com") => "example.com"
 * @example extractBaseDomain("**.app.io") => "app.io"
 */
export const extractBaseDomain = (wildcardPattern: string): string => {
	const normalized = wildcardPattern.toLowerCase().trim();
	if (normalized.startsWith("**.")) {
		return normalized.slice(3);
	}
	if (normalized.startsWith("*.")) {
		return normalized.slice(2);
	}
	return normalized;
};

/**
 * Checks if a domain matches any of the allowed wildcard patterns.
 *
 * @param domain - The domain to validate (e.g., "app.example.com")
 * @param wildcardPatterns - Array of wildcard patterns (e.g., ["*.example.com"])
 * @returns true if the domain matches at least one pattern
 *
 * Matching rules:
 * - "*.example.com" matches "app.example.com", "sub.example.com"
 * - "*.example.com" does NOT match "example.com" (requires subdomain)
 * - "*.example.com" does NOT match "deep.sub.example.com" (single level only)
 * - For multi-level: use "**.example.com" pattern
 */
export const matchesWildcardPattern = (
	domain: string,
	wildcardPatterns: string[],
): boolean => {
	const normalizedDomain = domain.toLowerCase().trim();

	for (const pattern of wildcardPatterns) {
		const normalizedPattern = pattern.toLowerCase().trim();

		if (normalizedPattern.startsWith("*.")) {
			// Single-level wildcard: *.example.com
			const baseDomain = normalizedPattern.slice(2);
			const domainParts = normalizedDomain.split(".");
			const baseParts = baseDomain.split(".");

			if (domainParts.length === baseParts.length + 1) {
				const domainSuffix = domainParts.slice(1).join(".");
				if (domainSuffix === baseDomain) {
					return true;
				}
			}
		} else if (normalizedPattern.startsWith("**.")) {
			// Multi-level wildcard: **.example.com
			const baseDomain = normalizedPattern.slice(3);
			if (normalizedDomain.endsWith(`.${baseDomain}`)) {
				return true;
			}
		} else if (normalizedDomain === normalizedPattern) {
			// Exact match
			return true;
		}
	}

	return false;
};

/**
 * Validates a domain against the server's wildcard restriction settings.
 * Returns validation result with error message if validation fails.
 */
export const validateDomainRestriction = async (
	domain: string,
): Promise<{ valid: boolean; error?: string }> => {
	const settings = await getWebServerSettings();
	const config = settings?.domainRestrictionConfig;

	if (!config?.enabled || config.allowedWildcards.length === 0) {
		return { valid: true };
	}

	if (matchesWildcardPattern(domain, config.allowedWildcards)) {
		return { valid: true };
	}

	return {
		valid: false,
		error: `Domain "${domain}" is not allowed. Must match one of: ${config.allowedWildcards.join(", ")}`,
	};
};
