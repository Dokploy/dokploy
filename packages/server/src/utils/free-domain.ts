export const FREE_DOMAIN_PROVIDERS = ["sslip.io", "traefik.me"] as const;

export type FreeDomainProvider = (typeof FREE_DOMAIN_PROVIDERS)[number];

export const DEFAULT_FREE_DOMAIN_PROVIDER: FreeDomainProvider = "sslip.io";

export const getFreeDomainProvider = (
	host?: string | null,
): FreeDomainProvider | undefined =>
	host == null
		? undefined
		: FREE_DOMAIN_PROVIDERS.find(
				(provider) => host === provider || host.endsWith(`.${provider}`),
			);

export const isFreeDomain = (host?: string | null): boolean =>
	getFreeDomainProvider(host) !== undefined;
