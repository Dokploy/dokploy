export const WEB_SERVER_PROVIDERS = ["traefik", "caddy"] as const;

export type WebServerProvider = (typeof WEB_SERVER_PROVIDERS)[number];

export const DEFAULT_WEB_SERVER_PROVIDER: WebServerProvider = "traefik";

export const isWebServerProvider = (
	provider: unknown,
): provider is WebServerProvider =>
	typeof provider === "string" &&
	WEB_SERVER_PROVIDERS.includes(provider as WebServerProvider);

export const normalizeWebServerProvider = (
	provider: unknown,
): WebServerProvider =>
	isWebServerProvider(provider) ? provider : DEFAULT_WEB_SERVER_PROVIDER;

export const getWebServerResourceName = (provider: WebServerProvider) => {
	return provider === "caddy" ? "dokploy-caddy" : "dokploy-traefik";
};
