import path from "node:path";
import type { Compose, Domain } from "@dokploy/server";
import { fs, vol } from "memfs";
import { parse, stringify } from "yaml";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

const execAsyncMock = vi.hoisted(() => vi.fn());
const execAsyncRemoteMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

import {
	addDomainToCompose,
	addDomainToComposeForWebServer,
	compileCaddyConfig,
	createCaddyComposeRouteFragment,
	createDomainLabels,
	isDokployGeneratedTraefikLabel,
	paths,
	readCaddyRouteFragments,
	refreshCaddyComposeRoutes,
} from "@dokploy/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const compose = (overrides: Partial<Compose> = {}) =>
	({
		appName: "my-compose",
		serverId: null,
		sourceType: "raw",
		composePath: "docker-compose.yml",
		composeType: "docker-compose",
		isolatedDeployment: false,
		isolatedDeploymentsVolume: false,
		randomize: false,
		suffix: null,
		...overrides,
	}) as Compose;

const domain = (overrides: Partial<Domain> = {}) =>
	({
		domainId: "domain-1",
		applicationId: null,
		composeId: "compose-1",
		previewDeploymentId: null,
		domainType: "compose",
		host: "example.com",
		path: "/",
		internalPath: "/",
		stripPath: false,
		https: false,
		certificateType: "none",
		customCertResolver: null,
		customEntrypoint: null,
		middlewares: null,
		port: 8080,
		serviceName: "web",
		uniqueConfigKey: 3,
		createdAt: "",
		...overrides,
	}) as Domain;

const writeComposeFile = (
	composeInput: Compose,
	content: Record<string, unknown>,
) => {
	const filePath = path.join(
		paths(false).COMPOSE_PATH,
		composeInput.appName,
		"code",
		"docker-compose.yml",
	);
	vol.mkdirSync(path.dirname(filePath), { recursive: true });
	vol.writeFileSync(filePath, stringify(content));
};

const getServers = (config: ReturnType<typeof compileCaddyConfig>) => {
	const apps = config.apps as Record<string, any>;
	return apps.http.servers as Record<string, any>;
};

beforeEach(() => {
	vol.reset();
	execAsyncMock.mockReset();
	execAsyncRemoteMock.mockReset();
	execAsyncMock.mockResolvedValue({ stdout: "dokploy-caddy\n", stderr: "" });
	execAsyncRemoteMock.mockResolvedValue({
		stdout: "dokploy-caddy\n",
		stderr: "",
	});
});

describe("Caddy compose route generation", () => {
	test("creates route fragments with compose upstream names", () => {
		const fragment = createCaddyComposeRouteFragment(
			compose(),
			domain(),
			"web",
		);
		const config = compileCaddyConfig({ fragments: [fragment] });

		expect(fragment).toMatchObject({
			id: "compose.my-compose.3",
			source: "dokploy-compose",
		});
		expect(getServers(config).http.routes[0].handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "my-compose-web:8080" }],
		});
	});

	test("uses swarm stack service names for Caddy upstreams", () => {
		const fragment = createCaddyComposeRouteFragment(
			compose({ composeType: "stack" }),
			domain(),
			"web-blue",
		);
		const config = compileCaddyConfig({ fragments: [fragment] });

		expect(getServers(config).http.routes[0].handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "my-compose_web-blue:8080" }],
		});
	});

	test("refreshes Caddy compose route fragments for domains created outside the domain router", async () => {
		const composeInput = compose();
		const routeDomain = domain({ https: true });
		writeComposeFile(composeInput, {
			services: {
				web: { image: "nginx" },
			},
		});

		await refreshCaddyComposeRoutes(composeInput, [routeDomain], "caddy");

		const fragments = await readCaddyRouteFragments();
		expect(fragments).toHaveLength(1);
		expect(fragments[0]).toMatchObject({
			id: "compose.my-compose.3",
			source: "dokploy-compose",
		});
		const config = compileCaddyConfig({ fragments });
		expect(getServers(config).https.routes[0].handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "my-compose-web:8080" }],
		});
	});

	test("loads uploaded certificates for custom Caddy compose HTTPS routes", () => {
		const fragment = createCaddyComposeRouteFragment(
			compose(),
			domain({
				https: true,
				certificateType: "custom",
				customCertResolver: "certificate-uploaded",
			}),
			"web",
		);
		const config = compileCaddyConfig({ fragments: [fragment] });
		const tls = (config.apps as any).tls;
		const certificatePath = `${paths(false).CERTIFICATES_PATH}/certificate-uploaded`;

		expect(tls.certificates.load_files).toEqual([
			{
				certificate: `${certificatePath}/chain.crt`,
				key: `${certificatePath}/privkey.key`,
			},
		]);
		expect(getServers(config).https.routes[0].handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "my-compose-web:8080" }],
		});
	});

	test("skips compose route refresh for Traefik provider", async () => {
		const composeInput = compose();
		writeComposeFile(composeInput, {
			services: {
				web: { image: "nginx" },
			},
		});

		await refreshCaddyComposeRoutes(composeInput, [domain()], "traefik");

		expect(await readCaddyRouteFragments()).toEqual([]);
		expect(execAsyncMock).not.toHaveBeenCalled();
	});

	test("Traefik provider conversion delegates to the existing Traefik label path", async () => {
		const composeInput = compose();
		writeComposeFile(composeInput, {
			services: {
				web: { image: "nginx" },
			},
		});

		const existingTraefikOutput = await addDomainToCompose(composeInput, [
			domain(),
		]);
		const providerOutput = await addDomainToComposeForWebServer(
			composeInput,
			[domain()],
			"traefik",
		);

		expect(providerOutput).toEqual(existingTraefikOutput);
	});

	test("Caddy compose conversion strips only Dokploy Traefik labels and attaches shared network", async () => {
		const composeInput = compose();
		const routeDomain = domain({ https: true, path: "/app", stripPath: true });
		const dokployLabels = [
			"traefik.docker.network=dokploy-network",
			"traefik.enable=true",
			...createDomainLabels(composeInput.appName, routeDomain, "web"),
			...createDomainLabels(composeInput.appName, routeDomain, "websecure"),
		];
		writeComposeFile(composeInput, {
			services: {
				web: {
					image: "nginx",
					labels: [
						"com.example.keep=true",
						"traefik.http.routers.manual.rule=Host(`manual.example.com`)",
						"traefik.http.routers.my-compose-custom-web.rule=Host(`custom.example.com`)",
						...dokployLabels,
					],
				},
			},
		});

		const converted = await addDomainToComposeForWebServer(
			composeInput,
			[routeDomain],
			"caddy",
		);

		const webService = converted?.services?.web;
		expect(webService).toBeDefined();
		const labels = webService?.labels as string[];
		expect(labels).toEqual([
			"com.example.keep=true",
			"traefik.http.routers.manual.rule=Host(`manual.example.com`)",
			"traefik.http.routers.my-compose-custom-web.rule=Host(`custom.example.com`)",
		]);
		expect(webService?.networks).toEqual({
			"dokploy-network": { aliases: ["my-compose-web"] },
			default: {},
		});
		expect(converted?.networks?.["dokploy-network"]).toEqual({
			external: true,
		});
	});

	test("Caddy compose conversion rejects unsupported domain fields before mutating compose labels", async () => {
		const composeInput = compose();
		writeComposeFile(composeInput, {
			services: {
				web: {
					image: "nginx",
					labels: [
						"traefik.enable=true",
						"traefik.http.routers.my-compose-3-web.rule=Host(`example.com`)",
					],
				},
			},
		});

		await expect(
			addDomainToComposeForWebServer(
				composeInput,
				[domain({ middlewares: ["auth@file"] })],
				"caddy",
			),
		).rejects.toThrow("unsupported Caddy fields");

		const stored = parse(
			vol
				.readFileSync(
					path.join(
						paths(false).COMPOSE_PATH,
						composeInput.appName,
						"code",
						"docker-compose.yml",
					),
					"utf8",
				)
				.toString(),
		) as any;
		expect(stored.services.web.labels).toEqual([
			"traefik.enable=true",
			"traefik.http.routers.my-compose-3-web.rule=Host(`example.com`)",
		]);
	});

	test("Caddy compose conversion uses finalized randomized service names", async () => {
		const composeInput = compose({ randomize: true, suffix: "blue" });
		writeComposeFile(composeInput, {
			services: {
				web: { image: "nginx" },
				worker: { image: "busybox", depends_on: ["web"] },
			},
		});

		const converted = await addDomainToComposeForWebServer(
			composeInput,
			[domain()],
			"caddy",
		);

		expect(converted?.services?.web).toBeUndefined();
		expect(converted?.services?.["web-blue"]?.networks).toEqual({
			"dokploy-network": { aliases: ["my-compose-web-blue"] },
			default: {},
		});
		expect(converted?.services?.["worker-blue"]?.depends_on).toEqual([
			"web-blue",
		]);
	});

	test("classifier identifies current Dokploy-generated Traefik labels without matching unrelated labels", () => {
		const routeDomain = domain({ https: true });
		expect(
			isDokployGeneratedTraefikLabel(
				"traefik.http.routers.my-compose-3-web.rule=Host(`example.com`)",
				{ appName: "my-compose", domains: [routeDomain] },
			),
		).toBe(true);
		expect(
			isDokployGeneratedTraefikLabel("traefik.enable=true", {
				includeGenericLabels: true,
			}),
		).toBe(true);
		expect(
			isDokployGeneratedTraefikLabel(
				"traefik.http.routers.manual.rule=Host(`manual.example.com`)",
				{ appName: "my-compose", domains: [routeDomain] },
			),
		).toBe(false);
	});
});
