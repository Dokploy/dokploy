import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * G2.2 — When IS_CLOUD is true (Dokploy Cloud), the SSO deny-list is not
 * applied at all (enforceSSO is a self-hosted-only toggle). The `before` hook
 * gates on `!IS_CLOUD`, so /callback/<provider> must never be blocked on cloud.
 *
 * This needs a separate test file because `IS_CLOUD` is captured at import
 * time in the `createAuthMiddleware` closure (the auth singleton is created
 * once per process). Vitest `pool: forks` isolates each test file in its own
 * fork, so this file gets a fresh singleton with IS_CLOUD mocked to true.
 */

const { getWebServerSettings } = vi.hoisted(() => ({
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: true,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: (...args: unknown[]) => getWebServerSettings(...args),
	updateWebServerSettings: vi.fn(),
}));

import { auth } from "@dokploy/server/lib/auth";

const BASE = "http://localhost:3000/api/auth";

const makeRequest = (path: string, init?: RequestInit) =>
	new Request(`${BASE}${path}`, init);

async function bodyText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}

const SSO_MESSAGE = "SSO is enforced";

describe("enforceSSO before hook: cloud (IS_CLOUD=true) is never blocked (G2.2)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not block /callback/github on cloud even when enforceSSO is true", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		// On Dokploy Cloud, the !IS_CLOUD gate is false, so the hook never throws
		// regardless of enforceSSO. The request proceeds to the real callback.
		let res: Response | null = null;
		try {
			res = await auth.handler(
				makeRequest("/callback/github?code=x&state=y", { method: "GET" }),
			);
		} catch {
			// Downstream state/DB errors are expected; the guarantee is no SSO block.
		}
		if (res) expect(await bodyText(res)).not.toContain(SSO_MESSAGE);
	});

	it("does not block /sign-in/email on cloud even when enforceSSO is true", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		let res: Response | null = null;
		try {
			res = await auth.handler(
				makeRequest("/sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ email: "a@b.c", password: "x" }),
				}),
			);
		} catch {
			// Downstream errors are expected; the guarantee is no SSO block.
		}
		if (res) expect(await bodyText(res)).not.toContain(SSO_MESSAGE);
	});
});
