import type { Domain } from "@dokploy/server/services/domain";
import { resolveWebServerProvider } from "@dokploy/server/services/web-server-settings";
import type { ApplicationNested } from "../builders";
import { manageCaddyDomain, removeCaddyDomain } from "../caddy/domain";
import { manageDomain, removeDomain } from "../traefik/domain";

export const manageWebServerDomain = async (
	app: ApplicationNested,
	domain: Domain,
) => {
	const provider = await resolveWebServerProvider(app.serverId);

	if (provider === "caddy") {
		return manageCaddyDomain(app, domain);
	}

	return manageDomain(app, domain);
};

export const removeWebServerDomain = async (
	app: ApplicationNested,
	uniqueConfigKey: number,
) => {
	const provider = await resolveWebServerProvider(app.serverId);

	if (provider === "caddy") {
		return removeCaddyDomain(app, uniqueConfigKey);
	}

	return removeDomain(app, uniqueConfigKey);
};
