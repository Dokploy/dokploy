import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the `hooks.before` SSO-enforcement middleware in
 * `packages/server/src/lib/auth.ts`.
 *
 * Pre-fix, the deny-list only covered *initiation* endpoints (e.g.
 * `/sign-in/social`) and omitted `/callback/:id` — the social-OAuth endpoint
 * that actually exchanges the OAuth code and calls `setSessionCookie`. With
 * `enforceSSO` enabled, a session could still be created through a social
 * provider callback, bypassing the SSO-only policy.
 *
 * These tests drive the real better-auth request pipeline (`auth.handler`)
 * with synthetic requests, so they exercise:
 *   - the per-request base-URL rehydration (`basePath = /api/auth`),
 *   - the user `hooks.before` middleware,
 *   - and the denial/allow decision based on `webServerSettings.enforceSSO`.
 *
 * The global `__test__/setup.ts` mock neutralises `@dokploy/server/db`, and
 * `IS_CLOUD` is `false` in the test environment (`process.env.IS_CLOUD` unset),
 * so the self-hosted `!IS_CLOUD` branch is active exactly as in production.
 */

// Hoisted so the mock fn exists when `auth.ts` is imported: its module-load
// context creation calls `resolveTrustedOrigins` -> `getWebServerSettings()`
// before top-level `const` initialization would otherwise run.
const { getWebServerSettings } = vi.hoisted(() => ({
	getWebServerSettings: vi.fn(),
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

describe("enforceSSO before hook: social OAuth callback gating", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("blocks the social OAuth callback /callback/github when enforceSSO is enabled", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		const res = await auth.handler(
			makeRequest("/callback/github?code=x&state=y", { method: "GET" }),
		);

		expect(res.status).toBe(403);
		expect(await bodyText(res)).toContain(SSO_MESSAGE);
	});

	it("blocks any provider social OAuth callback (e.g. /callback/google)", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		const res = await auth.handler(
			makeRequest("/callback/google?code=x&state=y", { method: "GET" }),
		);

		expect(res.status).toBe(403);
		expect(await bodyText(res)).toContain(SSO_MESSAGE);
	});

	it("does not block /callback/:id when enforceSSO is disabled", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: false });

		// With enforceSSO off, the hook must not short-circuit. The request proceeds
		// to the real callback, which fails downstream for unrelated reasons (no real
		// OAuth state exists), but it must never surface the SSO-enforcement message.
		let res: Response | null = null;
		try {
			res = await auth.handler(
				makeRequest("/callback/github?code=x&state=y", { method: "GET" }),
			);
		} catch {
			// Downstream state/DB errors are expected under mocked storage; the
			// guarantee under test is the absence of the SSO-enforcement denial.
		}
		if (res) expect(await bodyText(res)).not.toContain(SSO_MESSAGE);
	});

	it("does not block the legitimate SSO callback /sso/callback/:providerId when enforceSSO is enabled", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		// The `/callback/` prefix must not match `/sso/callback/...`; the enterprise
		// SSO callback is the one path the admin wants to keep open under enforceSSO.
		let res: Response | null = null;
		try {
			res = await auth.handler(
				makeRequest("/sso/callback/myprovider?code=x&state=y", {
					method: "GET",
				}),
			);
		} catch {
			// Downstream SSO state/DB errors are expected; the hook must not block it.
		}
		if (res) expect(await bodyText(res)).not.toContain(SSO_MESSAGE);
	});

	it("still blocks the email sign-in initiation path when enforceSSO is enabled", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		// No cookies and no Origin/Sec-Fetch-* headers: CSRF/origin checks are
		// skipped, so the before hook is the gate that fires.
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
			// Unreachable for a blocked path — the hook returns a 403 Response.
		}
		expect(res).not.toBeNull();
		expect(res?.status).toBe(403);
		expect(await bodyText(res as Response)).toContain(SSO_MESSAGE);
	});

	it("does not block /callback/:id when enforceSSO settings are absent (G2.3)", async () => {
		getWebServerSettings.mockResolvedValue(undefined);

		// When the settings row is missing, settings?.enforceSSO is falsy, so the
		// hook must not throw. The request proceeds to the real callback, which
		// fails downstream for unrelated reasons, but must never surface the
		// SSO-enforcement denial.
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

	it("does not block /sign-in/sso (the SSO init endpoint) when enforceSSO is enabled (G3.2)", async () => {
		getWebServerSettings.mockResolvedValue({ enforceSSO: true });

		// POST /sign-in/sso is the OIDC SSO initiation endpoint the admin relies on;
		// it must remain open under enforceSSO. No cookies and no Origin/Sec-Fetch-*
		// headers so CSRF/origin checks are skipped and the before hook is the gate.
		let res: Response | null = null;
		try {
			res = await auth.handler(
				makeRequest("/sign-in/sso", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: "alice@example.com",
						callbackURL: "https://dokploy.example/dashboard",
					}),
				}),
			);
		} catch {
			// Downstream SSO provider lookup errors are expected; the guarantee is
			// that the SSO-enforcement hook did not block this path.
		}
		if (res) expect(await bodyText(res)).not.toContain(SSO_MESSAGE);
	});
});
