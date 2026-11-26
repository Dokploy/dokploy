import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { docker } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { scaleService } from "@dokploy/server/services/scaling/scale-service";
import { applyPlacementSelection } from "@dokploy/server/services/scaling/scaling-settings";
import { TRAEFIK_VERSION } from "@dokploy/server/setup/traefik-setup";
import { addDomainToCompose } from "@dokploy/server/utils/docker/domain";
import { createServiceConfig } from "@dokploy/server/utils/traefik/application";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import {
	STACK_TRANSPORT,
	setApplicationTransport,
	VIP_TRANSPORT,
} from "@dokploy/server/utils/traefik/vip-transport";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { REAL_TEST_TIMEOUT, waitFor } from "./real-swarm";

const execFileAsync = promisify(execFile);

/**
 * Needs a swarm of at least two nodes, reached through DOCKER_HOST (CLI) and
 * DOKPLOY_DOCKER_HOST/PORT (Dokploy's client) at a manager, with some nodes
 * labelled dokploy.pool=web, a dokploy-network overlay, Dokploy's Traefik
 * image and traefik/whoami on every node, and the manager's port 80 reachable
 * at this URL.
 */
const TRAEFIK_URL = process.env.DOKPLOY_MULTINODE_TRAEFIK_URL;
const IMAGE = "traefik/whoami:v1.10.3";
const suffix = Date.now().toString(36);
const APP = `lb-app-${suffix}`;
const STACK = `lb-stack-${suffix}`;
const TRAEFIK = `lb-traefik-${suffix}`;
const CONFIG = `lb-dynamic-${suffix}`;

// node:http rather than fetch: fetch won't send a custom Host header.
const getVia = (host: string) =>
	new Promise<string | null>((resolve) => {
		const request = get(
			`${TRAEFIK_URL}/`,
			{ headers: { host }, agent: false },
			(response) => {
				let body = "";
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () =>
					resolve(response.statusCode === 200 ? body : null),
				);
			},
		);
		request.on("error", () => resolve(null));
	});

const hostnamesVia = async (host: string, requests: number) => {
	const seen = new Map<string, number>();
	for (let i = 0; i < requests; i++) {
		const body = await getVia(host);
		const hostname = body && /Hostname: (\S+)/.exec(body)?.[1];
		if (hostname) seen.set(hostname, (seen.get(hostname) ?? 0) + 1);
	}
	return seen;
};

/** Keeps four clients busy around `action` and counts failed requests. */
const failuresAround = async (host: string, action: () => Promise<unknown>) => {
	let running = true;
	let total = 0;
	let failures = 0;
	const client = async () => {
		while (running) {
			total++;
			if (!(await getVia(host))) failures++;
		}
	};
	const clients = Array.from({ length: 4 }, client);
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	await action();
	// Covers Swarm's stop of the removed tasks and a few Traefik refreshes.
	await new Promise((resolve) => setTimeout(resolve, 15_000));
	running = false;
	await Promise.all(clients);
	return { total, failures };
};

const nodeOfContainer = async (service: string) => {
	const tasks = await docker.listTasks({
		filters: JSON.stringify({
			service: [service],
			"desired-state": ["running"],
		}),
	});
	const nodes = await docker.listNodes();
	const hostnameOf = new Map(nodes.map((n) => [n.ID, n.Description?.Hostname]));
	return new Map(
		tasks
			.filter((task) => task.Status?.ContainerStatus?.ContainerID)
			.map((task) => [
				(task.Status?.ContainerStatus?.ContainerID as string).slice(0, 12),
				hostnameOf.get(task.NodeID as string) as string,
			]),
	);
};

describe.runIf(TRAEFIK_URL)("load balancing across nodes (real swarm)", () => {
	let workdir = "";

	beforeAll(async () => {
		workdir = mkdtempSync(join(tmpdir(), "lb-real-"));
		// What Dokploy writes for an application domain, plus the shared file a
		// stack deploy writes.
		const dynamic: FileConfig = {
			http: {
				routers: {
					[`${APP}-router-1`]: {
						rule: "Host(`app.lab`)",
						service: `${APP}-service-1`,
						entryPoints: ["web"],
					},
				},
				services: {
					[`${APP}-service-1`]: createServiceConfig(APP, {
						port: 80,
					} as Domain),
				},
			},
		};
		setApplicationTransport(dynamic, APP);
		dynamic.http = {
			...dynamic.http,
			serversTransports: {
				...dynamic.http?.serversTransports,
				[STACK_TRANSPORT]: VIP_TRANSPORT,
			},
		};
		await docker.createConfig({
			Name: CONFIG,
			Data: Buffer.from(stringify(dynamic)).toString("base64"),
		});
		const config = await docker.getConfig(CONFIG).inspect();
		await docker.createService({
			Name: TRAEFIK,
			TaskTemplate: {
				ContainerSpec: {
					Image: `traefik:v${TRAEFIK_VERSION}`,
					Args: [
						"--entrypoints.web.address=:80",
						"--providers.swarm.exposedByDefault=false",
						"--providers.swarm.refreshSeconds=5",
						"--providers.file.filename=/etc/traefik/dynamic.yml",
					],
					Mounts: [
						{
							Type: "bind",
							Source: "/var/run/docker.sock",
							Target: "/var/run/docker.sock",
						},
					],
					Configs: [
						{
							ConfigID: config.ID,
							ConfigName: CONFIG,
							File: {
								Name: "/etc/traefik/dynamic.yml",
								UID: "0",
								GID: "0",
								Mode: 0o444,
							},
						},
					],
				},
				Networks: [{ Target: "dokploy-network" }],
				Placement: { Constraints: ["node.role==manager"] },
			},
			EndpointSpec: {
				Ports: [{ TargetPort: 80, PublishedPort: 80, PublishMode: "host" }],
			},
		});

		// An application placed by the Scaling tab on any node; Swarm spreads it.
		// whoami ignores SIGTERM as PID 1; with an init it stops at once, like
		// most servers, so removed replicas really go away.
		await docker.createService({
			Name: APP,
			TaskTemplate: {
				ContainerSpec: { Image: IMAGE, Init: true },
				Networks: [{ Target: "dokploy-network" }],
				Placement: applyPlacementSelection(null, {
					nodeTarget: "any",
					hostname: null,
					pool: null,
					maxReplicasPerNode: 0,
				}),
			},
			Mode: { Replicated: { Replicas: 4 } },
		});

		// A stack service with a Dokploy domain and a saved pool placement.
		const compose = {
			appName: STACK,
			composeType: "stack",
			composePath: "docker-compose.yml",
			sourceType: "raw",
			serverId: null,
			isolatedDeployment: false,
			randomize: false,
			suffix: "",
			composeFile: `services:\n  web:\n    image: ${IMAGE}\n    init: true\n    deploy:\n      replicas: 3\n`,
		} as unknown as Compose;
		const domain = {
			host: "stack.lab",
			port: 80,
			https: false,
			uniqueConfigKey: 1,
			customEntrypoint: null,
			certificateType: "none",
			serviceName: "web",
			path: "/",
			internalPath: "/",
			stripPath: false,
			middlewares: null,
			enabled: true,
		} as unknown as Domain;
		const spec = await addDomainToCompose(
			compose,
			[domain],
			[
				{
					serviceName: "web",
					replicas: null,
					placement: {
						nodeTarget: "pool",
						hostname: null,
						pool: "web",
						maxReplicasPerNode: 0,
					},
				},
			],
		);
		if (!spec) throw new Error("no compose spec");
		const file = join(workdir, "docker-compose.yml");
		writeFileSync(file, stringify(spec));
		await execFileAsync("docker", ["stack", "deploy", "-c", file, STACK]);

		for (const service of [TRAEFIK, APP, `${STACK}_web`]) {
			await waitFor(
				async () =>
					(
						await docker.listTasks({
							filters: JSON.stringify({
								service: [service],
								"desired-state": ["running"],
							}),
						})
					).filter((task) => task.Status?.State === "running").length,
				(running) => running >= 1,
				120_000,
			);
		}
	}, REAL_TEST_TIMEOUT);

	afterAll(async () => {
		await execFileAsync("docker", ["stack", "rm", STACK]).catch(
			() => undefined,
		);
		for (const name of [APP, TRAEFIK]) {
			await docker
				.getService(name)
				.remove()
				.catch(() => undefined);
		}
		await new Promise((resolve) => setTimeout(resolve, 3_000));
		await docker
			.getConfig(CONFIG)
			.remove()
			.catch(() => undefined);
		if (workdir) rmSync(workdir, { recursive: true, force: true });
	});

	it(
		"spreads an application over every node and Traefik reaches all of them",
		async () => {
			const placement = await waitFor(
				() => nodeOfContainer(APP),
				(byContainer) => byContainer.size === 4,
				120_000,
			);
			const nodes = new Set(placement.values());
			expect(nodes.size).toBeGreaterThanOrEqual(2);

			const seen = await waitFor(
				() => hostnamesVia("app.lab", 40),
				(hostnames) => hostnames.size === 4,
				60_000,
			);
			expect(seen.size).toBe(4);
			expect(
				new Set([...seen.keys()].map((id) => placement.get(id))).size,
			).toBe(nodes.size);
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"keeps a pooled stack service on its pool and Traefik reaches every replica",
		async () => {
			const placement = await waitFor(
				() => nodeOfContainer(`${STACK}_web`),
				(byContainer) => byContainer.size === 3,
				120_000,
			);
			const poolNodes = (await docker.listNodes())
				.filter((node) => node.Spec?.Labels?.["dokploy.pool"] === "web")
				.map((node) => node.Description?.Hostname);
			expect(new Set(placement.values())).toEqual(new Set(poolNodes));

			const seen = await waitFor(
				() => hostnamesVia("stack.lab", 30),
				(hostnames) => hostnames.size === 3,
				60_000,
			);
			expect([...seen.keys()].sort()).toEqual([...placement.keys()].sort());
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"keeps answering while replicas are removed",
		async () => {
			for (const [host, service] of [
				["app.lab", APP],
				["stack.lab", `${STACK}_web`],
			] as const) {
				const { total, failures } = await failuresAround(host, () =>
					scaleService({ docker, serviceName: service, replicas: 1 }),
				);
				expect(total).toBeGreaterThan(100);
				expect({ host, failures }).toEqual({ host, failures: 0 });
			}
		},
		REAL_TEST_TIMEOUT,
	);
});
