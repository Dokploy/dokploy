import { createHmac } from "node:crypto";
import type { CreateServiceOptions } from "dockerode";
import { betterAuthSecret } from "../lib/auth-secret";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const FORWARD_AUTH_SERVICE_NAME = "dokploy-forward-auth";
const FORWARD_AUTH_IMAGE = "quay.io/oauth2-proxy/oauth2-proxy:v7.6.0";

export const FORWARD_AUTH_PORT = 4180;

export interface ForwardAuthOidcConfig {
	clientId: string;
	clientSecret: string;
	issuer: string;
	scopes?: string[];
	skipDiscovery?: boolean;
}

export interface SetupForwardAuthOptions {
	serverId?: string;
	oidc: ForwardAuthOidcConfig;
	cookieSecret: string;
	authDomain: string;
	baseDomain: string;
	authDomainHttps?: boolean;
	emailDomains?: string[];
}

export const deriveBaseDomain = (authDomain: string): string => {
	const labels = authDomain.trim().toLowerCase().split(".").filter(Boolean);
	const base = labels.length > 2 ? labels.slice(1) : labels;
	return `.${base.join(".")}`;
};

export const forwardAuthCallbackUrl = (
	authDomain: string,
	https: boolean,
): string => `${https ? "https" : "http"}://${authDomain}/oauth2/callback`;

export const deriveCookieSecret = (salt: string): string => {
	// oauth2-proxy requires cookie_secret to be exactly 16, 24, or 32 bytes.
	// Take the first 32 hex chars (= 16 bytes) to satisfy that constraint.
	return createHmac("sha256", betterAuthSecret)
		.update(`forward-auth:${salt}`)
		.digest("hex")
		.slice(0, 32);
};

export const buildForwardAuthEnv = (
	options: SetupForwardAuthOptions,
): string[] => {
	const { oidc, cookieSecret, authDomain, baseDomain, authDomainHttps } =
		options;
	const scheme = authDomainHttps ? "https" : "http";
	const emailDomains =
		options.emailDomains && options.emailDomains.length > 0
			? options.emailDomains
			: ["*"];

	const env: string[] = [
		"OAUTH2_PROXY_PROVIDER=oidc",
		`OAUTH2_PROXY_OIDC_ISSUER_URL=${oidc.issuer}`,
		`OAUTH2_PROXY_CLIENT_ID=${oidc.clientId}`,
		`OAUTH2_PROXY_CLIENT_SECRET=${oidc.clientSecret}`,
		`OAUTH2_PROXY_COOKIE_SECRET=${cookieSecret}`,
		`OAUTH2_PROXY_HTTP_ADDRESS=0.0.0.0:${FORWARD_AUTH_PORT}`,
		"OAUTH2_PROXY_REVERSE_PROXY=true",
		"OAUTH2_PROXY_SKIP_PROVIDER_BUTTON=true",
		"OAUTH2_PROXY_SET_XAUTHREQUEST=true",
		"OAUTH2_PROXY_UPSTREAMS=static://202",
		`OAUTH2_PROXY_REDIRECT_URL=${scheme}://${authDomain}/oauth2/callback`,
		`OAUTH2_PROXY_COOKIE_DOMAINS=${baseDomain}`,
		`OAUTH2_PROXY_WHITELIST_DOMAINS=${baseDomain}`,
		`OAUTH2_PROXY_COOKIE_SECURE=${authDomainHttps ? "true" : "false"}`,
		"OAUTH2_PROXY_INSECURE_OIDC_ALLOW_UNVERIFIED_EMAIL=true",
		`OAUTH2_PROXY_EMAIL_DOMAINS=${emailDomains.join(",")}`,
	];

	const scopes = oidc.scopes?.length
		? oidc.scopes
		: ["openid", "email", "profile"];
	env.push(`OAUTH2_PROXY_SCOPE=${scopes.join(" ")}`);

	if (oidc.skipDiscovery) {
		env.push("OAUTH2_PROXY_SKIP_OIDC_DISCOVERY=true");
	}

	return env;
};

export const setupForwardAuth = async (options: SetupForwardAuthOptions) => {
	const { serverId } = options;
	const docker = await getRemoteDocker(serverId);

	const settings: CreateServiceOptions = {
		Name: FORWARD_AUTH_SERVICE_NAME,
		TaskTemplate: {
			ContainerSpec: {
				Image: FORWARD_AUTH_IMAGE,
				Env: buildForwardAuthEnv(options),
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
	};

	try {
		const service = docker.getService(FORWARD_AUTH_SERVICE_NAME);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
		console.log("Forward Auth Updated ✅");
	} catch (_) {
		try {
			await docker.createService(settings);
			console.log("Forward Auth Started ✅");
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Forward Auth service already exists, continuing...");
		}
	}
};

export const removeForwardAuth = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	try {
		const service = docker.getService(FORWARD_AUTH_SERVICE_NAME);
		await service.remove();
		console.log("Forward Auth Removed ✅");
	} catch {}
};

export const isForwardAuthRunning = async (
	serverId?: string,
): Promise<boolean> => {
	const docker = await getRemoteDocker(serverId);
	try {
		await docker.getService(FORWARD_AUTH_SERVICE_NAME).inspect();
		return true;
	} catch {
		return false;
	}
};
