import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import { manageDomain, paths, removeDomain } from "@dokploy/server";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import {
	ensureApplicationTransport,
	getWriteStackTransportCommand,
} from "@dokploy/server/utils/traefik/vip-transport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

const appName = "shop-a1b2c3";

const domain = (uniqueConfigKey: number): Domain =>
	({
		applicationId: "app-1",
		certificateType: "none",
		host: `d${uniqueConfigKey}.example.com`,
		https: false,
		path: null,
		port: 3000,
		customEntrypoint: null,
		domainType: "application",
		uniqueConfigKey,
		internalPath: "/",
		stripPath: false,
		middlewares: null,
		forwardAuthEnabled: false,
		enabled: true,
	}) as unknown as Domain;

const app = {
	appName,
	serverId: null,
	redirects: [],
	security: [],
} as unknown as ApplicationNested;

describe("application VIP transport", () => {
	let cwd: string;
	const configPath = () =>
		path.join(cwd, ".docker/traefik/dynamic", `${appName}.yml`);
	const readConfig = () =>
		parse(fs.readFileSync(configPath(), "utf8")) as FileConfig;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-vip-"));
		fs.mkdirSync(path.join(cwd, ".docker/traefik/dynamic"), {
			recursive: true,
		});
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("opens a connection per request for every domain of the app", async () => {
		await manageDomain(app, domain(1));
		await manageDomain(app, domain(2));

		const config = readConfig();
		expect(config.http?.serversTransports).toEqual({
			[`${appName}-vip`]: { maxIdleConnsPerHost: -1 },
		});
		for (const key of [1, 2]) {
			expect(config.http?.services?.[`${appName}-service-${key}`]).toEqual({
				loadBalancer: {
					servers: [{ url: `http://${appName}:3000` }],
					passHostHeader: true,
					serversTransport: `${appName}-vip`,
				},
			});
		}

		await removeDomain(app, 1);
		expect(readConfig().http?.serversTransports).toBeDefined();
		await removeDomain(app, 2);
		expect(fs.existsSync(configPath())).toBe(false);
	});

	it("moves domains written before the transport onto it", async () => {
		fs.writeFileSync(
			configPath(),
			stringify({
				http: {
					routers: {
						[`${appName}-router-1`]: {
							rule: "Host(`a.example.com`)",
							service: `${appName}-service-1`,
						},
					},
					services: {
						[`${appName}-service-1`]: {
							loadBalancer: { servers: [{ url: `http://${appName}:80` }] },
						},
						[`${appName}-service-2`]: {
							loadBalancer: {
								servers: [{ url: `http://${appName}:81` }],
								serversTransport: "custom",
							},
						},
						"hand-written": {
							loadBalancer: { servers: [{ url: "http://other:80" }] },
						},
					},
				},
			}),
		);

		expect(await ensureApplicationTransport(appName, null)).toBe(true);
		const services = readConfig().http?.services ?? {};
		expect(services[`${appName}-service-1`]).toMatchObject({
			loadBalancer: { serversTransport: `${appName}-vip` },
		});
		expect(services[`${appName}-service-2`]).toMatchObject({
			loadBalancer: { serversTransport: "custom" },
		});
		expect(services["hand-written"]).toEqual({
			loadBalancer: { servers: [{ url: "http://other:80" }] },
		});
		expect(await ensureApplicationTransport(appName, null)).toBe(false);
	});

	it("writes nothing for an app without domains", async () => {
		expect(await ensureApplicationTransport(appName, null)).toBe(false);
		expect(fs.existsSync(configPath())).toBe(false);
	});
});

const hasBash = (() => {
	try {
		execFileSync("bash", ["-c", "true"]);
		return true;
	} catch {
		return false;
	}
})();

describe.runIf(hasBash)("stack transport file", () => {
	it("writes the shared transport once and leaves it alone afterwards", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-stack-vip-"));
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		try {
			const command = getWriteStackTransportCommand(null);
			execFileSync("bash", ["-c", command]);
			const file = path.join(paths().DYNAMIC_TRAEFIK_PATH, "dokploy-vip.yml");
			expect(parse(fs.readFileSync(file, "utf8"))).toEqual({
				http: {
					serversTransports: { "dokploy-vip": { maxIdleConnsPerHost: -1 } },
				},
			});

			const written = fs.statSync(file).mtimeMs;
			execFileSync("bash", ["-c", `sleep 0.05; ${command}`]);
			expect(fs.statSync(file).mtimeMs).toBe(written);
		} finally {
			vi.restoreAllMocks();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
