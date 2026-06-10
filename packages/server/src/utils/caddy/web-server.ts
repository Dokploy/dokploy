import type { webServerSettings } from "@dokploy/server/db/schema/web-server-settings";
import { localWebServerSettingsToCaddyCompileSettings } from "@dokploy/server/services/web-server-settings";
import {
	compileWriteAndReloadCaddyConfigSafely,
	readCaddyRouteFragments,
	removeCaddyRouteFragment,
	writeCaddyRouteFragment,
} from "./config";
import type { CaddyRouteFragment, CaddyRouteIntent } from "./types";
import { DOKPLOY_CADDY_NETWORK } from "./upstream-targets";

const CADDY_FRAGMENT_VERSION = 1;
const DASHBOARD_FRAGMENT_ID = "dashboard.dokploy";

const isSameFragment = (
	first: CaddyRouteFragment | undefined,
	second: CaddyRouteFragment | undefined,
) => JSON.stringify(first) === JSON.stringify(second);

const toPunycode = (host: string): string => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

export const createCaddyDashboardRouteIntent = (
	settings: typeof webServerSettings.$inferSelect,
	host: string,
): CaddyRouteIntent => ({
	id: "dokploy-dashboard",
	source: "dokploy-dashboard",
	hosts: [toPunycode(host)],
	pathPrefix: "/",
	https: !!settings.https,
	upstreams: [`http://dokploy:${process.env.PORT || 3000}`],
	upstreamNetwork: DOKPLOY_CADDY_NETWORK,
});

export const createCaddyDashboardRouteFragment = (
	settings: typeof webServerSettings.$inferSelect,
	host: string,
): CaddyRouteFragment => ({
	version: CADDY_FRAGMENT_VERSION,
	id: DASHBOARD_FRAGMENT_ID,
	source: "dokploy-dashboard",
	description: "Dokploy dashboard route",
	routes: [createCaddyDashboardRouteIntent(settings, host)],
});

export const updateServerCaddy = async (
	settings: typeof webServerSettings.$inferSelect,
	newHost: string | null,
) => {
	const compileSettings =
		localWebServerSettingsToCaddyCompileSettings(settings);
	const previousDashboardFragment = (await readCaddyRouteFragments()).find(
		(fragment) => fragment.id === DASHBOARD_FRAGMENT_ID,
	);
	let writtenDashboardFragment: CaddyRouteFragment | undefined;
	try {
		if (newHost) {
			writtenDashboardFragment = createCaddyDashboardRouteFragment(
				settings,
				newHost,
			);
			await writeCaddyRouteFragment(writtenDashboardFragment);
		} else {
			await removeCaddyRouteFragment(DASHBOARD_FRAGMENT_ID);
		}

		await compileWriteAndReloadCaddyConfigSafely(compileSettings);
	} catch (error) {
		const currentDashboardFragment = (await readCaddyRouteFragments()).find(
			(fragment) => fragment.id === DASHBOARD_FRAGMENT_ID,
		);
		const shouldRestorePrevious = newHost
			? isSameFragment(currentDashboardFragment, writtenDashboardFragment)
			: !currentDashboardFragment;

		if (shouldRestorePrevious) {
			if (previousDashboardFragment) {
				await writeCaddyRouteFragment(previousDashboardFragment);
			} else {
				await removeCaddyRouteFragment(DASHBOARD_FRAGMENT_ID);
			}
		} else {
			try {
				await compileWriteAndReloadCaddyConfigSafely(compileSettings);
			} catch (resyncError) {
				if (error instanceof Error) {
					(error as Error & { resyncError?: unknown }).resyncError =
						resyncError;
				}
			}
		}
		throw error;
	}
};
