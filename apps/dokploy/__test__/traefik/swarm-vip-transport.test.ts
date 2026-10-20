import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import type { Domain } from "@dokploy/server/services/domain";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import {
	manageDomain,
	reconcileSwarmVipConnectionReuse,
} from "@dokploy/server/utils/traefik/domain";
import { afterAll, expect, test, vi } from "vitest";
import { parse, stringify } from "yaml";

const dynamicPath = fs.mkdtempSync(
	path.join(os.tmpdir(), "dokploy-swarm-vip-transport-"),
);

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({
			...actual.paths(),
			DYNAMIC_TRAEFIK_PATH: dynamicPath,
		}),
	};
});

const application = (swarmVipConnectionReuse: boolean): ApplicationNested =>
	({
		appName: "crawl4ai",
		serverId: null,
		redirects: [],
		security: [],
		swarmVipConnectionReuse,
	}) as unknown as ApplicationNested;

const domain = (uniqueConfigKey: number): Domain =>
	({
		applicationId: "application-id",
		certificateType: "none",
		createdAt: "",
		domainId: `domain-${uniqueConfigKey}`,
		host: `${uniqueConfigKey}.example.com`,
		https: false,
		path: null,
		port: 11235,
		customEntrypoint: null,
		serviceName: "",
		composeId: null,
		customCertResolver: null,
		domainType: "application",
		uniqueConfigKey,
		previewDeploymentId: null,
		internalPath: "/",
		stripPath: false,
		middlewares: null,
		forwardAuthEnabled: false,
		enabled: true,
	}) as Domain;

const readConfig = (): FileConfig =>
	parse(
		fs.readFileSync(path.join(dynamicPath, "crawl4ai.yml"), "utf8"),
	) as FileConfig;

afterAll(() => fs.rmSync(dynamicPath, { recursive: true }));

test("renders and removes the application-owned Swarm VIP transport", async () => {
	await manageDomain(application(true), domain(1));
	await manageDomain(application(true), domain(2));
	await reconcileSwarmVipConnectionReuse(application(false));

	const disabledReuse = readConfig();
	expect(disabledReuse.http?.services?.["crawl4ai-service-1"]).toEqual({
		loadBalancer: {
			servers: [{ url: "http://crawl4ai:11235" }],
			passHostHeader: true,
			serversTransport: "crawl4ai-swarm-vip",
		},
	});
	expect(disabledReuse.http?.serversTransports).toEqual({
		"crawl4ai-swarm-vip": { maxIdleConnsPerHost: -1 },
	});
	const customService = disabledReuse.http?.services?.["crawl4ai-service-2"];
	if (
		!customService ||
		!("loadBalancer" in customService) ||
		!customService.loadBalancer
	) {
		throw new Error("second generated service is missing");
	}
	customService.loadBalancer.serversTransport = "custom-transport";
	disabledReuse.http ??= {};
	disabledReuse.http.serversTransports ??= {};
	disabledReuse.http.serversTransports["custom-transport"] = {};
	fs.writeFileSync(
		path.join(dynamicPath, "crawl4ai.yml"),
		stringify(disabledReuse),
	);

	await reconcileSwarmVipConnectionReuse(application(true));

	const enabledReuse = readConfig();
	expect(enabledReuse.http?.serversTransports).toEqual({
		"custom-transport": {},
	});
	expect(enabledReuse.http?.services?.["crawl4ai-service-1"]).toEqual({
		loadBalancer: {
			servers: [{ url: "http://crawl4ai:11235" }],
			passHostHeader: true,
		},
	});
	expect(enabledReuse.http?.services?.["crawl4ai-service-2"]).toEqual({
		loadBalancer: {
			servers: [{ url: "http://crawl4ai:11235" }],
			passHostHeader: true,
			serversTransport: "custom-transport",
		},
	});
});

test("does not write an empty route file", async () => {
	const missingApplication = {
		...application(false),
		appName: "missing-application",
	};
	await reconcileSwarmVipConnectionReuse(missingApplication);

	expect(fs.existsSync(path.join(dynamicPath, "missing-application.yml"))).toBe(
		false,
	);
});

test("keeps a hand-set custom transport", async () => {
	const app = { ...application(true), appName: "custom-app" };
	await manageDomain(app, domain(3));
	const configPath = path.join(dynamicPath, "custom-app.yml");
	const config = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
	const service = config.http?.services?.["custom-app-service-3"];
	if (!service || !("loadBalancer" in service) || !service.loadBalancer) {
		throw new Error("generated service is missing");
	}
	service.loadBalancer.serversTransport = "custom-transport";
	fs.writeFileSync(configPath, stringify(config));

	await reconcileSwarmVipConnectionReuse({
		...app,
		swarmVipConnectionReuse: false,
	});
	const disabled = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
	expect(disabled.http?.services?.["custom-app-service-3"]).toMatchObject({
		loadBalancer: { serversTransport: "custom-transport" },
	});

	await reconcileSwarmVipConnectionReuse(app);
	const enabled = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
	expect(enabled.http?.services?.["custom-app-service-3"]).toMatchObject({
		loadBalancer: { serversTransport: "custom-transport" },
	});
	expect(enabled.http?.serversTransports).toBeUndefined();
});

test("preserves other services and routers in the file", async () => {
	const app = { ...application(true), appName: "multi-service-app" };
	await manageDomain(app, domain(4));
	const configPath = path.join(dynamicPath, `${app.appName}.yml`);
	const config = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;

	config.http ??= {};
	config.http.routers ??= {};
	config.http.routers["unrelated-router"] = {
		rule: "Host(`api.example.com`)",
		service: "unrelated-service",
		entryPoints: ["web"],
	};
	config.http.services ??= {};
	config.http.services["unrelated-service"] = {
		loadBalancer: {
			servers: [{ url: "http://unrelated:8080" }],
		},
	};
	fs.writeFileSync(configPath, stringify(config));

	await reconcileSwarmVipConnectionReuse({
		...app,
		swarmVipConnectionReuse: false,
	});

	const disabled = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
	expect(disabled.http?.routers?.["unrelated-router"]).toEqual({
		rule: "Host(`api.example.com`)",
		service: "unrelated-service",
		entryPoints: ["web"],
	});
	expect(disabled.http?.services?.["unrelated-service"]).toEqual({
		loadBalancer: {
			servers: [{ url: "http://unrelated:8080" }],
		},
	});
	expect(disabled.http?.services?.[`${app.appName}-service-4`]).toMatchObject({
		loadBalancer: { serversTransport: `${app.appName}-swarm-vip` },
	});

	await reconcileSwarmVipConnectionReuse(app);

	const enabled = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
	expect(enabled.http?.routers?.["unrelated-router"]).toEqual({
		rule: "Host(`api.example.com`)",
		service: "unrelated-service",
		entryPoints: ["web"],
	});
	expect(enabled.http?.services?.["unrelated-service"]).toEqual({
		loadBalancer: {
			servers: [{ url: "http://unrelated:8080" }],
		},
	});
	expect(enabled.http?.services?.[`${app.appName}-service-4`]).toMatchObject({
		loadBalancer: {
			servers: [{ url: `http://${app.appName}:11235` }],
		},
	});
	const service4 = enabled.http?.services?.[`${app.appName}-service-4`];
	if (!service4 || !("loadBalancer" in service4) || !service4.loadBalancer) {
		throw new Error("service 4 is missing");
	}
	expect(service4.loadBalancer.serversTransport).toBeUndefined();
});
