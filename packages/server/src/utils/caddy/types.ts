export type CaddyRouteSource =
	| "dokploy-application"
	| "dokploy-compose"
	| "dokploy-dashboard"
	| "manual"
	| "traefik-dynamic-file"
	| "traefik-compose-label";

export type CaddyHeaderMap = Record<string, string | string[]>;

export interface CaddyRouteTransform {
	stripPrefix?: string | null;
	addPrefix?: string | null;
	requestHeaders?: CaddyHeaderMap | null;
	responseHeaders?: CaddyHeaderMap | null;
}

export interface CaddyRouteRedirectScheme {
	scheme: string;
	permanent?: boolean | null;
	port?: string | null;
}

export interface CaddyStaticResponse {
	statusCode: number;
	body?: string | null;
	headers?: CaddyHeaderMap | null;
}

export interface CaddyTlsCertificateFile {
	certificate: string;
	key: string;
}

export interface CaddyBasicAuthAccount {
	username: string;
	hash: string;
}

export interface CaddyRouteIntent {
	id: string;
	source: CaddyRouteSource;
	hosts: string[];
	pathPrefix?: string | null;
	pathExact?: string | null;
	allowedRemoteIps?: string[] | null;
	https?: boolean;
	priority?: number | null;
	upstreams: string[];
	upstreamNetwork?: string | null;
	transforms?: CaddyRouteTransform | null;
	basicAuth?: CaddyBasicAuthAccount[] | null;
	tlsCertificate?: CaddyTlsCertificateFile | null;
	redirectScheme?: CaddyRouteRedirectScheme | null;
	staticResponse?: CaddyStaticResponse | null;
}

export interface CaddyRouteFragment {
	version: 1;
	id: string;
	source: CaddyRouteSource;
	description?: string;
	routes: CaddyRouteIntent[];
}

export interface CaddyTrustedProxyConfig {
	source: "static" | "cloudflare";
	ranges?: string[] | null;
	clientIpHeaders?: string[] | null;
	strict?: boolean | null;
}

export interface CaddyTrustedProxySettings {
	mode: "disabled" | "cloudflare" | "static";
	ranges?: string[] | null;
	clientIpHeaders?: string[] | null;
	strict?: boolean | null;
}

export interface CaddyAccessLogConfig {
	enabled: boolean;
	filename?: string | null;
}

export interface CaddyCompileOptions {
	fragments?: CaddyRouteFragment[];
	routes?: CaddyRouteIntent[];
	letsEncryptEmail?: string | null;
	trustedProxies?: CaddyTrustedProxyConfig | null;
	accessLogs?: CaddyAccessLogConfig | null;
}

export type CaddyJsonObject = Record<string, unknown>;

export interface CaddyFragmentStoreOptions {
	serverId?: string;
}
