export const FREE_DOMAIN_PROVIDERS = ["sslip.io", "traefik.me"] as const;

export type FreeDomainProvider = (typeof FREE_DOMAIN_PROVIDERS)[number];

export const DEFAULT_FREE_DOMAIN_PROVIDER: FreeDomainProvider = "sslip.io";

export const isFreeDomain = (host?: string | null): boolean =>
	!!host && FREE_DOMAIN_PROVIDERS.some((provider) => host.includes(provider));
