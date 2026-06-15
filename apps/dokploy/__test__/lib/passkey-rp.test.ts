import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EnvSnapshot = NodeJS.ProcessEnv;

const envKeys = [
	"IS_CLOUD",
	"BETTER_AUTH_URL",
	"NEXT_PUBLIC_APP_URL",
	"NODE_ENV",
	"PORT",
] as const;

const snapshotEnv = (): EnvSnapshot => ({ ...process.env });

const restoreEnv = (snapshot: EnvSnapshot) => {
	for (const key of envKeys) {
		if (snapshot[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = snapshot[key];
		}
	}
};

const loadPasskeyRpModule = async () => {
	vi.resetModules();
	return import("@dokploy/server/lib/passkey-rp");
};

describe("resolvePasskeyRpConfigFromEnv", () => {
	let envSnapshot: EnvSnapshot;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of envKeys) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
		vi.resetModules();
	});

	describe("cloud deployment", () => {
		it("returns hardcoded app.dokploy.com RP config when IS_CLOUD is true", async () => {
			process.env.IS_CLOUD = "true";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "app.dokploy.com",
				rpName: "Dokploy",
				origin: "https://app.dokploy.com",
			});
		});

		it("ignores BETTER_AUTH_URL when IS_CLOUD is true", async () => {
			process.env.IS_CLOUD = "true";
			process.env.BETTER_AUTH_URL = "https://custom.example.com";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "app.dokploy.com",
				rpName: "Dokploy",
				origin: "https://app.dokploy.com",
			});
		});
	});

	describe("env URL override", () => {
		it("uses BETTER_AUTH_URL for rpID and origin on self-hosted installs", async () => {
			process.env.BETTER_AUTH_URL = "https://dokploy.example.com";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "dokploy.example.com",
				rpName: "Dokploy",
				origin: "https://dokploy.example.com",
			});
		});

		it("prefers BETTER_AUTH_URL over NEXT_PUBLIC_APP_URL", async () => {
			process.env.BETTER_AUTH_URL = "https://auth.example.com";
			process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "auth.example.com",
				rpName: "Dokploy",
				origin: "https://auth.example.com",
			});
		});

		it("falls back to NEXT_PUBLIC_APP_URL when BETTER_AUTH_URL is unset", async () => {
			process.env.NEXT_PUBLIC_APP_URL = "https://panel.example.com";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "panel.example.com",
				rpName: "Dokploy",
				origin: "https://panel.example.com",
			});
		});

		it("strips trailing slashes from configured URLs", async () => {
			process.env.BETTER_AUTH_URL = "https://dokploy.example.com/";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "dokploy.example.com",
				rpName: "Dokploy",
				origin: "https://dokploy.example.com",
			});
		});

		it("treats whitespace-only env values as unset", async () => {
			process.env.BETTER_AUTH_URL = "   ";
			process.env.NEXT_PUBLIC_APP_URL = "\t";
			process.env.NODE_ENV = "development";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "localhost",
				rpName: "Dokploy",
				origin: "http://localhost:3000",
			});
		});
	});

	describe("localhost / development", () => {
		it("uses localhost rpID when configured URL hostname is localhost", async () => {
			process.env.BETTER_AUTH_URL = "http://localhost:3000";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "localhost",
				rpName: "Dokploy",
				origin: "http://localhost:3000",
			});
		});

		it("defaults to localhost in development when no public URL is configured", async () => {
			process.env.NODE_ENV = "development";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "localhost",
				rpName: "Dokploy",
				origin: "http://localhost:3000",
			});
		});

		it("honors PORT in the development localhost fallback", async () => {
			process.env.NODE_ENV = "development";
			process.env.PORT = "4000";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toEqual({
				rpID: "localhost",
				rpName: "Dokploy",
				origin: "http://localhost:4000",
			});
		});
	});

	describe("production without env", () => {
		it("returns null so async resolver can read web server settings", async () => {
			process.env.NODE_ENV = "production";

			const { resolvePasskeyRpConfigFromEnv } = await loadPasskeyRpModule();

			expect(resolvePasskeyRpConfigFromEnv()).toBeNull();
		});
	});
});

describe("resolvePasskeyRpConfig", () => {
	let envSnapshot: EnvSnapshot;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		for (const key of envKeys) {
			delete process.env[key];
		}
	});

	afterEach(() => {
		restoreEnv(envSnapshot);
		vi.resetModules();
		vi.doUnmock("@dokploy/server/services/web-server-settings");
	});

	it("uses web server host and https from settings when env URL is unset", async () => {
		process.env.NODE_ENV = "production";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi.fn().mockResolvedValue({
				host: "dokploy.example.com",
				https: true,
				serverIp: "203.0.113.10",
			}),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "dokploy.example.com",
			rpName: "Dokploy",
			origin: "https://dokploy.example.com",
		});
	});

	it("uses http when settings.https is false", async () => {
		process.env.NODE_ENV = "production";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi.fn().mockResolvedValue({
				host: "dokploy.local",
				https: false,
				serverIp: "10.0.0.1",
			}),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "dokploy.local",
			rpName: "Dokploy",
			origin: "http://dokploy.local",
		});
	});

	it("falls back to serverIp and PORT when host is unset", async () => {
		process.env.NODE_ENV = "production";
		process.env.PORT = "8080";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi.fn().mockResolvedValue({
				host: null,
				https: false,
				serverIp: "203.0.113.10",
			}),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "203.0.113.10",
			rpName: "Dokploy",
			origin: "http://203.0.113.10:8080",
		});
	});

	it("prefers BETTER_AUTH_URL over web server settings", async () => {
		process.env.NODE_ENV = "production";
		process.env.BETTER_AUTH_URL = "https://override.example.com";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi.fn().mockResolvedValue({
				host: "dokploy.example.com",
				https: true,
			}),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "override.example.com",
			rpName: "Dokploy",
			origin: "https://override.example.com",
		});
	});

	it("defaults to localhost when settings are empty and env is unset", async () => {
		process.env.NODE_ENV = "production";
		process.env.PORT = "8080";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi.fn().mockResolvedValue({
				host: null,
				https: false,
				serverIp: null,
			}),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "localhost",
			rpName: "Dokploy",
			origin: "http://localhost:8080",
		});
	});

	it("defaults to localhost when getWebServerSettings throws", async () => {
		process.env.NODE_ENV = "production";
		process.env.PORT = "3000";

		vi.doMock("@dokploy/server/services/web-server-settings", () => ({
			getWebServerSettings: vi
				.fn()
				.mockRejectedValue(new Error("database unavailable")),
		}));

		const { resolvePasskeyRpConfig } = await loadPasskeyRpModule();

		await expect(resolvePasskeyRpConfig()).resolves.toEqual({
			rpID: "localhost",
			rpName: "Dokploy",
			origin: "http://localhost:3000",
		});
	});
});

describe("getPasskeyDevOrigins", () => {
	it("returns localhost and 127.0.0.1 origins for a port", async () => {
		const { getPasskeyDevOrigins } = await loadPasskeyRpModule();

		expect(getPasskeyDevOrigins("3000")).toEqual([
			"http://localhost:3000",
			"http://127.0.0.1:3000",
		]);
	});
});

describe("originMatchesRpConfig", () => {
	it("matches when browser origin equals config origin", async () => {
		const { originMatchesRpConfig } = await loadPasskeyRpModule();

		expect(
			originMatchesRpConfig("https://dokploy.example.com", {
				rpID: "dokploy.example.com",
				rpName: "Dokploy",
				origin: "https://dokploy.example.com",
			}),
		).toBe(true);
	});

	it("rejects mismatched origins", async () => {
		const { originMatchesRpConfig } = await loadPasskeyRpModule();

		expect(
			originMatchesRpConfig("http://127.0.0.1:3000", {
				rpID: "localhost",
				rpName: "Dokploy",
				origin: "http://localhost:3000",
			}),
		).toBe(false);
	});
});

describe("passkeyRpFromOrigin", () => {
	it("maps a public HTTPS URL to rpID and origin", async () => {
		const { passkeyRpFromOrigin } = await loadPasskeyRpModule();

		expect(passkeyRpFromOrigin("https://dokploy.example.com/")).toEqual({
			rpID: "dokploy.example.com",
			rpName: "Dokploy",
			origin: "https://dokploy.example.com",
		});
	});

	it("keeps localhost as rpID for local origins", async () => {
		const { passkeyRpFromOrigin } = await loadPasskeyRpModule();

		expect(passkeyRpFromOrigin("http://localhost:4000")).toEqual({
			rpID: "localhost",
			rpName: "Dokploy",
			origin: "http://localhost:4000",
		});
	});
});
