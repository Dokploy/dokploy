import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const importAuthSecret = async () => {
	vi.resetModules();
	return await import("@dokploy/server/lib/auth-secret");
};

describe("betterAuthSecret", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.stubEnv("BETTER_AUTH_SECRET", "");
		vi.stubEnv("BETTER_AUTH_SECRET_FILE", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("uses BETTER_AUTH_SECRET when configured", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv(
			"BETTER_AUTH_SECRET",
			"configured-production-secret-000000000000",
		);

		await expect(importAuthSecret()).resolves.toMatchObject({
			betterAuthSecret: "configured-production-secret-000000000000",
		});
	});

	it("reads BETTER_AUTH_SECRET_FILE when configured", async () => {
		vi.stubEnv("NODE_ENV", "production");
		const dir = await mkdtemp(path.join(tmpdir(), "dokploy-auth-secret-"));
		const secretPath = path.join(dir, "better-auth-secret");
		await writeFile(secretPath, "file-production-secret-000000000000\n");
		vi.stubEnv("BETTER_AUTH_SECRET_FILE", secretPath);

		try {
			await expect(importAuthSecret()).resolves.toMatchObject({
				betterAuthSecret: "file-production-secret-000000000000",
			});
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("throws in production when no explicit secret is configured", async () => {
		vi.stubEnv("NODE_ENV", "production");

		await expect(importAuthSecret()).rejects.toThrow(
			"BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE is required in production.",
		);
	});

	it("throws during the Next production server phase without an explicit secret", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("NEXT_PHASE", "phase-production-server");

		await expect(importAuthSecret()).rejects.toThrow(
			"BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE is required in production.",
		);
	});

	it("does not trust build-next lifecycle markers outside the Next build script", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("npm_lifecycle_event", "build-next");

		await expect(importAuthSecret()).rejects.toThrow(
			"BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE is required in production.",
		);
	});

	it("allows production builds to bootstrap without a runtime secret", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("npm_lifecycle_event", "build-next");
		vi.stubEnv("npm_lifecycle_script", "next build --webpack");
		vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const { betterAuthSecret } = await importAuthSecret();

		expect(betterAuthSecret).toContain("dokploy-build-auth-secret");
		expect(betterAuthSecret).not.toBe("better-auth-secret-123456789");
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("[BUILD AUTH CONFIG]"),
		);
	});

	it("allows the Next production build phase to bootstrap without a runtime secret", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("NEXT_PHASE", "phase-production-build");
		vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const { betterAuthSecret } = await importAuthSecret();

		expect(betterAuthSecret).toContain("dokploy-build-auth-secret");
		expect(betterAuthSecret).not.toBe("better-auth-secret-123456789");
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("[BUILD AUTH CONFIG]"),
		);
	});

	it("allows unit tests to bootstrap without a configured secret", async () => {
		vi.stubEnv("NODE_ENV", "test");

		const { betterAuthSecret } = await importAuthSecret();

		expect(betterAuthSecret).toContain("dokploy-test-auth-secret");
		expect(betterAuthSecret).not.toBe("better-auth-secret-123456789");
	});

	it("allows local development bootstrap without a configured secret", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const { betterAuthSecret } = await importAuthSecret();

		expect(betterAuthSecret).toContain("dokploy-development-auth-secret");
		expect(betterAuthSecret).not.toBe("better-auth-secret-123456789");
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("[DEVELOPMENT AUTH CONFIG]"),
		);
	});
});
