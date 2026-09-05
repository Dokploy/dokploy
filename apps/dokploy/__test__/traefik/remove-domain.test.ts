import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	loadOrCreateConfig,
	writeTraefikConfig,
} from "@dokploy/server/utils/traefik/application";
import { removeDomain } from "@dokploy/server/utils/traefik/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// removeDomain delegates path/forward-auth cleanup to siblings that operate on
// the shared middlewares.yml. Stub those so this test stays focused on the
// per-app router/service removal and the app-config-file lifecycle, which is
// what the domain.delete fix now wires preview domains into.
vi.mock("@dokploy/server/utils/traefik/middleware", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/traefik/middleware")
		>();
	return {
		...actual,
		removePathMiddlewares: vi.fn().mockResolvedValue(undefined),
	};
});
vi.mock(
	"@dokploy/server/utils/traefik/forward-auth",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/utils/traefik/forward-auth")
			>();
		return {
			...actual,
			removeForwardAuthMiddleware: vi.fn().mockResolvedValue(undefined),
		};
	},
);

// preview config files are named preview-<parentApp>-<rand6>.yml; the domain.delete
// fix mutates appName to this value before calling removeDomain.
const APP_NAME = "preview-parent-ab12cd";

const seedFile = (keys: number[]) => {
	const routers: Record<string, unknown> = {};
	const services: Record<string, unknown> = {};
	for (const key of keys) {
		routers[`${APP_NAME}-router-${key}`] = {
			rule: `Host(\`preview-${key}.example.com\`)`,
			service: `${APP_NAME}-service-${key}`,
			entryPoints: ["web"],
			middlewares: [],
		};
		routers[`${APP_NAME}-router-websecure-${key}`] = {
			rule: `Host(\`preview-${key}.example.com\`)`,
			service: `${APP_NAME}-service-${key}`,
			entryPoints: ["websecure"],
			middlewares: [],
			tls: { certResolver: "letsencrypt" },
		};
		services[`${APP_NAME}-service-${key}`] = {
			loadBalancer: {
				servers: [{ url: `http://${APP_NAME}:3000` }],
				passHostHeader: true,
			},
		};
	}
	writeTraefikConfig(
		{ http: { routers: routers as never, services: services as never } },
		APP_NAME,
	);
};

describe("removeDomain (preview-*.yml cleanup)", () => {
	let cwd: string;
	let dynamicPath: string;
	let configPath: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-remove-domain-"));
		dynamicPath = path.join(cwd, ".docker", "traefik", "dynamic");
		fs.mkdirSync(dynamicPath, { recursive: true });
		configPath = path.join(dynamicPath, `${APP_NAME}.yml`);
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("removes the router and service for the given uniqueConfigKey while keeping others", async () => {
		seedFile([42, 7]);

		await removeDomain({ appName: APP_NAME, serverId: null } as never, 42);

		expect(fs.existsSync(configPath)).toBe(true);
		const config = loadOrCreateConfig(APP_NAME);
		expect(config.http?.routers?.[`${APP_NAME}-router-42`]).toBeUndefined();
		expect(
			config.http?.routers?.[`${APP_NAME}-router-websecure-42`],
		).toBeUndefined();
		expect(config.http?.services?.[`${APP_NAME}-service-42`]).toBeUndefined();
		expect(config.http?.routers?.[`${APP_NAME}-router-7`]).toBeDefined();
		expect(
			config.http?.routers?.[`${APP_NAME}-router-websecure-7`],
		).toBeDefined();
		expect(config.http?.services?.[`${APP_NAME}-service-7`]).toBeDefined();
	});

	it("deletes the whole preview-*.yml when the removed router was the last one", async () => {
		seedFile([42]);
		expect(fs.existsSync(configPath)).toBe(true);

		await removeDomain({ appName: APP_NAME, serverId: null } as never, 42);

		expect(fs.existsSync(configPath)).toBe(false);
	});
});
