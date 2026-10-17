import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain, FileConfig } from "@dokploy/server";
import {
	manageDomain,
	reconcileSwarmVipConnectionReuse,
} from "@dokploy/server";
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
