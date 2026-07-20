import type { Compose } from "@dokploy/server/services/compose";

export const DOKPLOY_CADDY_NETWORK = "dokploy-network";

export const getCaddyComposeNetworkAlias = (
	appName: string,
	finalServiceName: string,
) => `${appName}-${finalServiceName}`;

export const getCaddyComposeRuntimeTarget = (
	compose: Pick<Compose, "appName" | "composeType" | "isolatedDeployment">,
	finalServiceName: string,
) => {
	if (compose.composeType === "stack") {
		return {
			host: `${compose.appName}_${finalServiceName}`,
			network: compose.isolatedDeployment
				? compose.appName
				: DOKPLOY_CADDY_NETWORK,
		};
	}

	if (compose.isolatedDeployment) {
		return {
			host: finalServiceName,
			network: compose.appName,
		};
	}

	return {
		host: getCaddyComposeNetworkAlias(compose.appName, finalServiceName),
		network: DOKPLOY_CADDY_NETWORK,
	};
};
