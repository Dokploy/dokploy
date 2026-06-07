import { IS_CLOUD } from "../constants";
import { getWebServerSettings } from "../services/web-server-settings";

export type PasskeyRpConfig = {
	rpID: string;
	rpName: string;
	origin: string;
};

const RP_NAME = "Dokploy";

/**
 * Builds WebAuthn RP config from a public Dokploy URL (no trailing slash).
 * Mirrors hostname → rpID rules used by {@link getDokployUrl}.
 */
export const passkeyRpFromOrigin = (origin: string): PasskeyRpConfig => {
	const normalized = origin.replace(/\/$/, "");
	const { hostname } = new URL(normalized);
	return {
		rpID: hostname === "localhost" ? "localhost" : hostname,
		rpName: RP_NAME,
		origin: normalized,
	};
};

const localhostFallback = (): PasskeyRpConfig => {
	const port = process.env.PORT ?? "3000";
	return passkeyRpFromOrigin(`http://localhost:${port}`);
};

/**
 * Resolves passkey RP from env / cloud / dev only (no DB).
 * Returns `null` when self-hosted production should read web server settings.
 *
 * Operator guide: `plans/passkey-auth.md`
 */
export const resolvePasskeyRpConfigFromEnv = (): PasskeyRpConfig | null => {
	if (IS_CLOUD) {
		return passkeyRpFromOrigin("https://app.dokploy.com");
	}

	const configuredUrl =
		process.env.BETTER_AUTH_URL?.trim() ||
		process.env.NEXT_PUBLIC_APP_URL?.trim() ||
		"";

	if (configuredUrl) {
		return passkeyRpFromOrigin(configuredUrl);
	}

	if (process.env.NODE_ENV === "development") {
		return localhostFallback();
	}

	return null;
};

/**
 * Resolves WebAuthn RP ID and origin for the passkey plugin at init time.
 *
 * Priority: cloud hardcode → `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` → dev
 * localhost → web server settings (`host` + `https`, else `serverIp` + PORT) →
 * localhost fallback.
 *
 * `@better-auth/passkey` only accepts static `rpID` / `origin`; values are loaded
 * once when `auth.ts` initializes (restart required after host changes).
 */
export const resolvePasskeyRpConfig = async (): Promise<PasskeyRpConfig> => {
	const fromEnv = resolvePasskeyRpConfigFromEnv();
	if (fromEnv) {
		return fromEnv;
	}

	try {
		const settings = await getWebServerSettings();
		if (settings?.host) {
			const protocol = settings.https ? "https" : "http";
			return passkeyRpFromOrigin(`${protocol}://${settings.host}`);
		}
		if (settings?.serverIp) {
			const port = process.env.PORT ?? "3000";
			return passkeyRpFromOrigin(`http://${settings.serverIp}:${port}`);
		}
	} catch (error) {
		console.error(
			"Failed to load web server settings for passkey RP config:",
			error,
		);
	}

	return localhostFallback();
};

/**
 * Dev origins accepted by Better Auth trustedOrigins (only one rpID is active;
 * canonical URL is chosen via BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL).
 */
export const getPasskeyDevOrigins = (port: string): string[] => [
	`http://localhost:${port}`,
	`http://127.0.0.1:${port}`,
];

/** Whether the browser origin matches the resolved passkey RP config (exact match). */
export const originMatchesRpConfig = (
	browserOrigin: string,
	config: PasskeyRpConfig,
): boolean => browserOrigin.replace(/\/$/, "") === config.origin;
