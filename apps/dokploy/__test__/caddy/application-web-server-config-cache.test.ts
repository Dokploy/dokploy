import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { invalidateApplicationWebServerConfig } from "@/components/dashboard/application/web-server-config-cache";

const createUtils = () => ({
	application: {
		readTraefikConfig: {
			invalidate: vi.fn(),
		},
		readWebServerConfig: {
			invalidate: vi.fn(),
		},
	},
});

test("invalidates legacy Traefik and provider-aware application web-server config caches", async () => {
	const utils = createUtils();

	await invalidateApplicationWebServerConfig(utils, "app-1");

	expect(utils.application.readTraefikConfig.invalidate).toHaveBeenCalledWith({
		applicationId: "app-1",
	});
	expect(utils.application.readWebServerConfig.invalidate).toHaveBeenCalledWith(
		{ applicationId: "app-1" },
	);
});

test("awaits both application web-server config cache invalidations", async () => {
	const calls: string[] = [];
	const utils = createUtils();
	utils.application.readTraefikConfig.invalidate.mockImplementation(
		async () => {
			await Promise.resolve();
			calls.push("traefik");
		},
	);
	utils.application.readWebServerConfig.invalidate.mockImplementation(
		async () => {
			await Promise.resolve();
			calls.push("web-server");
		},
	);

	await invalidateApplicationWebServerConfig(utils, "app-1");

	expect(calls).toEqual(["traefik", "web-server"]);
});

test("propagates application web-server config cache invalidation failures", async () => {
	const utils = createUtils();
	utils.application.readWebServerConfig.invalidate.mockRejectedValueOnce(
		new Error("provider-aware cache failed"),
	);

	await expect(
		invalidateApplicationWebServerConfig(utils, "app-1"),
	).rejects.toThrow("provider-aware cache failed");
	expect(utils.application.readTraefikConfig.invalidate).toHaveBeenCalledWith({
		applicationId: "app-1",
	});
});

const applicationMutationHandlers = [
	[
		"domain handler",
		"../../components/dashboard/application/domains/handle-domain.tsx",
	],
	[
		"redirect form handler",
		"../../components/dashboard/application/advanced/redirects/handle-redirect.tsx",
	],
	[
		"redirect delete handler",
		"../../components/dashboard/application/advanced/redirects/show-redirects.tsx",
	],
	[
		"security form handler",
		"../../components/dashboard/application/advanced/security/handle-security.tsx",
	],
	[
		"security delete handler",
		"../../components/dashboard/application/advanced/security/show-security.tsx",
	],
] as const;

test.each(applicationMutationHandlers)(
	"%s uses the shared application web-server cache invalidation helper",
	(_name, filePath) => {
		const source = readFileSync(new URL(filePath, import.meta.url), "utf8");

		expect(source).toContain("invalidateApplicationWebServerConfig");
		expect(source).not.toMatch(/readTraefikConfig\.invalidate/);
		expect(source).not.toMatch(/readWebServerConfig\.invalidate/);
	},
);
