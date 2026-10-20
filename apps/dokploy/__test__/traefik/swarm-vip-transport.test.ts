import { execFileSync } from "node:child_process";
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

const proxyState = vi.hoisted(() => ({
	configuration: "{}",
	containers: "abcdef123456",
	error: undefined as Error | undefined,
}));
const localExec = vi.hoisted(() =>
	vi.fn(async (command: string) => {
		if (proxyState.error) throw proxyState.error;
		return {
			stdout: command.startsWith("docker ps")
				? proxyState.containers
				: proxyState.configuration,
			stderr: "",
		};
	}),
);
const remoteExec = vi.hoisted(() => vi.fn());
const remoteWrite = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: localExec,
	execAsyncRemote: remoteExec,
	writeFileRemote: remoteWrite,
}));

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

test("keeps a hand-set transport when reuse is turned off", async () => {
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

test("rejects when a remote route file cannot be read", async () => {
	remoteExec.mockImplementation(async (_serverId, command) => {
		if (command.startsWith("docker")) return localExec(command);
		throw new Error("SSH connection refused");
	});

	await expect(
		reconcileSwarmVipConnectionReuse({
			appName: "remote-app",
			serverId: "server-id",
			swarmVipConnectionReuse: false,
		}),
	).rejects.toThrow("SSH connection refused");
});

test.each(["write", "publish", "write-and-close"] as const)(
	"preserves routes and permits retry when atomic %s fails",
	async (failure) => {
		const app = { ...application(true), appName: `atomic-${failure}` };
		await manageDomain(app, domain(4));
		const configPath = path.join(dynamicPath, `${app.appName}.yml`);
		fs.chmodSync(configPath, 0o640);
		const before = fs.readFileSync(configPath, "utf8");
		const filesBefore = fs.readdirSync(dynamicPath).sort();
		const write = fs.writeFileSync;
		const close = fs.closeSync;
		const failingClose =
			failure === "write-and-close"
				? vi.spyOn(fs, "closeSync").mockImplementationOnce((descriptor) => {
						close(descriptor);
						throw new Error("simulated close failure");
					})
				: undefined;
		const failingOperation =
			failure !== "publish"
				? vi
						.spyOn(fs, "writeFileSync")
						.mockImplementationOnce((file, _data, options) => {
							write(file, "partial", options);
							throw new Error("simulated disk full");
						})
				: vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
						throw new Error("simulated publish failure");
					});
		try {
			const error = await reconcileSwarmVipConnectionReuse({
				...app,
				swarmVipConnectionReuse: false,
			}).then(
				() => undefined,
				(error: unknown) => error,
			);
			if (failure === "write-and-close") {
				expect(error).toBeInstanceOf(AggregateError);
				expect(
					(error as AggregateError).errors.map((cause) => cause.message),
				).toEqual(["simulated disk full", "simulated close failure"]);
			} else {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("simulated");
			}
			expect(fs.readFileSync(configPath, "utf8")).toBe(before);
			expect(fs.statSync(configPath).mode & 0o777).toBe(0o640);
			expect(fs.readdirSync(dynamicPath).sort()).toEqual(filesBefore);
		} finally {
			failingOperation.mockRestore();
			failingClose?.mockRestore();
		}
		await reconcileSwarmVipConnectionReuse({
			...app,
			swarmVipConnectionReuse: false,
		});
		const after = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
		expect(after.http?.routers).toEqual(
			(parse(before) as FileConfig).http?.routers,
		);
		expect(after.http?.services?.[`${app.appName}-service-4`]).toMatchObject({
			loadBalancer: { serversTransport: `${app.appName}-swarm-vip` },
		});
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o640);
	},
);

test.each(["write", "publish", "cleanup"] as const)(
	"preserves remote routes and reports an atomic %s failure",
	async (failure) => {
		const app = { ...application(true), appName: `remote-atomic-${failure}` };
		await manageDomain(app, domain(5));
		const configPath = path.join(dynamicPath, `${app.appName}.yml`);
		fs.chmodSync(configPath, 0o640);
		const before = fs.readFileSync(configPath, "utf8");
		const filesBefore = fs.readdirSync(dynamicPath).sort();
		let failing = true;
		remoteExec.mockImplementation(async (_serverId, command) => {
			if (command.startsWith("docker")) return localExec(command);
			if (failing && failure === "publish" && command.startsWith("mv -f --")) {
				throw new Error("simulated remote publish failure");
			}
			if (failing && failure === "cleanup" && command.startsWith("rm -f --")) {
				throw new Error("simulated cleanup connection failure");
			}
			return {
				stdout: execFileSync("sh", ["-c", command], { encoding: "utf8" }),
				stderr: "",
			};
		});
		remoteWrite.mockImplementation(async (_serverId, destination, content) => {
			fs.writeFileSync(destination, "partial");
			if (failing && failure !== "publish")
				throw new Error("simulated remote disk full");
			fs.writeFileSync(destination, content);
		});
		const remoteApp = {
			...app,
			serverId: "server-id",
			swarmVipConnectionReuse: false,
		};
		try {
			const error = await reconcileSwarmVipConnectionReuse(remoteApp).then(
				() => undefined,
				(error: unknown) => error,
			);
			if (failure === "cleanup") {
				expect(error).toBeInstanceOf(AggregateError);
				expect(
					(error as AggregateError).errors.map((cause) => cause.message),
				).toEqual([
					"simulated remote disk full",
					"simulated cleanup connection failure",
				]);
			} else {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("simulated remote");
				expect(fs.readdirSync(dynamicPath).sort()).toEqual(filesBefore);
			}
			expect(fs.readFileSync(configPath, "utf8")).toBe(before);
			expect(fs.statSync(configPath).mode & 0o777).toBe(0o640);
			failing = false;
			await reconcileSwarmVipConnectionReuse(remoteApp);
			const after = parse(fs.readFileSync(configPath, "utf8")) as FileConfig;
			expect(after.http?.routers).toEqual(
				(parse(before) as FileConfig).http?.routers,
			);
			expect(after.http?.services?.[`${app.appName}-service-5`]).toMatchObject({
				loadBalancer: { serversTransport: `${app.appName}-swarm-vip` },
			});
			expect(fs.statSync(configPath).mode & 0o777).toBe(0o640);
		} finally {
			remoteExec.mockReset();
			remoteWrite.mockReset();
			for (const name of fs.readdirSync(dynamicPath)) {
				if (!filesBefore.includes(name))
					fs.rmSync(path.join(dynamicPath, name), { force: true });
			}
		}
	},
);

test.each([{}, { debug: false }])(
	"rejects a loaded FastProxy configuration %j without changing routes",
	async (fastProxy) => {
		const app = { ...application(true), appName: "fast-proxy-app" };
		await manageDomain(app, domain(6));
		const configPath = path.join(dynamicPath, `${app.appName}.yml`);
		const before = fs.readFileSync(configPath, "utf8");
		proxyState.configuration = JSON.stringify({ experimental: { fastProxy } });
		try {
			await expect(
				reconcileSwarmVipConnectionReuse({
					...app,
					swarmVipConnectionReuse: false,
				}),
			).rejects.toThrow("FastProxy");
			expect(fs.readFileSync(configPath, "utf8")).toBe(before);
			await expect(
				manageDomain({ ...app, swarmVipConnectionReuse: false }, domain(7)),
			).rejects.toThrow("FastProxy");
			expect(fs.readFileSync(configPath, "utf8")).toBe(before);
		} finally {
			proxyState.configuration = "{}";
		}
	},
);

test("rejects an unavailable runtime inspection but permits restoring reuse", async () => {
	const app = { ...application(false), appName: "restore-proxy-app" };
	await manageDomain(app, domain(8));
	const configPath = path.join(dynamicPath, `${app.appName}.yml`);
	const before = fs.readFileSync(configPath, "utf8");
	proxyState.error = new Error("internal API unavailable");
	try {
		await expect(reconcileSwarmVipConnectionReuse(app)).rejects.toThrow(
			"Could not inspect",
		);
		expect(fs.readFileSync(configPath, "utf8")).toBe(before);
		await reconcileSwarmVipConnectionReuse({
			...app,
			swarmVipConnectionReuse: true,
		});
		expect(
			(parse(fs.readFileSync(configPath, "utf8")) as FileConfig).http
				?.serversTransports,
		).toBeUndefined();
	} finally {
		proxyState.error = undefined;
	}
});
