import { IS_CLOUD } from "../constants";

export type PasskeyRpConfig = {
	rpID: string;
	rpName: string;
	origin: string;
};

/**
 * Resolves WebAuthn RP ID and origin for the passkey plugin at init time.
 * Mirrors {@link getDokployUrl} when `BETTER_AUTH_URL` is set to the public Dokploy URL.
 * Self-hosted installs should set `BETTER_AUTH_URL` (e.g. `https://dokploy.example.com`)
 * so rpID/origin match the browser origin users sign in from.
 */
export const resolvePasskeyRpConfig = (): PasskeyRpConfig => {
	const rpName = "Dokploy";

	if (IS_CLOUD) {
		return {
			rpID: "app.dokploy.com",
			rpName,
			origin: "https://app.dokploy.com",
		};
	}

	const configuredUrl =
		process.env.BETTER_AUTH_URL?.trim() ||
		process.env.NEXT_PUBLIC_APP_URL?.trim() ||
		"";

	if (configuredUrl) {
		const origin = configuredUrl.replace(/\/$/, "");
		const hostname = new URL(origin).hostname;
		const rpID = hostname === "localhost" ? "localhost" : hostname;
		return { rpID, rpName, origin };
	}

	if (process.env.NODE_ENV === "development") {
		const port = process.env.PORT ?? "3000";
		return {
			rpID: "localhost",
			rpName,
			origin: `http://localhost:${port}`,
		};
	}

	const port = process.env.PORT ?? "3000";
	return {
		rpID: "localhost",
		rpName,
		origin: `http://localhost:${port}`,
	};
};
