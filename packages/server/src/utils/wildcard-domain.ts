/**
 * Utilities for wildcard domain support
 */

export const isWildcardDomain = (domain: string): boolean => {
	// Check if domain starts with *.
	return domain.startsWith('*.');
};

export const extractBaseDomain = (wildcardDomain: string): string => {
	// Extract base domain from wildcard (e.g., *.example.com -> example.com)
	if (!isWildcardDomain(wildcardDomain)) {
		return wildcardDomain;
	}
	return wildcardDomain.substring(2); // Remove '*.'
};

export const validateWildcardDomain = (domain: string): boolean => {
	// Basic validation for wildcard domains
	if (!isWildcardDomain(domain)) {
		return false;
	}

	const baseDomain = extractBaseDomain(domain);

	// Check if base domain is valid (basic check)
	const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	return domainRegex.test(baseDomain);
};

export const canUseHttpChallenge = (domain: string): boolean => {
	// HTTP challenge cannot be used for wildcard domains
	return !isWildcardDomain(domain);
};

export const canUseDnsChallenge = (domain: string): boolean => {
	// DNS challenge can be used for all domains, especially wildcards
	return isWildcardDomain(domain) || true;
};

export const getCertificateType = (domain: string): 'http' | 'dns' => {
	return isWildcardDomain(domain) ? 'dns' : 'http';
};

export const generateResolverName = (dnsProviderType: string, index: number): string => {
	return `letsencrypt-dns-${dnsProviderType}-${index}`;
};

export const generateDnsEnvironmentVars = (provider: {
	type: string;
	apiToken?: string;
	secretAccessKey?: string;
	accessKeyId?: string;
	region?: string;
}): Record<string, string> => {
	const envVars: Record<string, string> = {};

	switch (provider.type) {
		case 'cloudflare':
			if (provider.apiToken) {
				envVars['CLOUDFLARE_EMAIL'] = 'no-reply@example.com'; // Generic email
				envVars['CLOUDFLARE_DNS_API_TOKEN'] = provider.apiToken;
			}
			break;
		case 'digitalocean':
			if (provider.apiToken) {
				envVars['DO_AUTH_TOKEN'] = provider.apiToken;
			}
			break;
		case 'route53':
			if (provider.accessKeyId && provider.secretAccessKey) {
				envVars['AWS_ACCESS_KEY_ID'] = provider.accessKeyId;
				envVars['AWS_SECRET_ACCESS_KEY'] = provider.secretAccessKey;
				if (provider.region) {
					envVars['AWS_REGION'] = provider.region;
				}
			}
			break;
		case 'namecheap':
			if (provider.apiToken) {
				envVars['NAMECHEAP_API_USER'] = provider.apiToken;
				envVars['NAMECHEAP_API_KEY'] = provider.apiToken;
			}
			break;
		case 'gandi':
			if (provider.apiToken) {
				envVars['GANDI_API_KEY'] = provider.apiToken;
			}
			break;
		case 'azure':
			if (provider.apiToken && provider.accessKeyId) {
				envVars['AZURE_CLIENT_ID'] = provider.accessKeyId;
				envVars['AZURE_CLIENT_SECRET'] = provider.apiToken;
				if (provider.region) {
					envVars['AZURE_TENANT_ID'] = provider.region;
				}
			}
			break;
		case 'google':
			if (provider.apiToken) {
				envVars['GCE_PROJECT'] = provider.region || 'default';
				envVars['GCE_SERVICE_ACCOUNT_FILE'] = '/etc/dokploy/traefik/dns/google-service-account.json';
			}
			break;
	}

	return envVars;
};