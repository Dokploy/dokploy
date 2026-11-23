import { writeFileSync } from "node:fs";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import type { Certificate } from "@dokploy/server/services/certificate";
import {
	getWebServerProvider,
	getWebServerSettings,
} from "@dokploy/server/services/web-server-settings";
import {
	assertCaddyAcceptsRedirect,
	caddySyncError,
	loadCaddyState,
	parseCaddyLookup,
	recordCaddySwitch,
	syncCaddy,
	withCaddyQueue,
} from "@dokploy/server/utils/caddy/sync";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import {
	execAsync,
	execAsyncRemote,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import * as bcrypt from "bcrypt";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerProvider: vi.fn(),
	getWebServerSettings: vi.fn(),
}));
vi.mock("node:fs", async (original) => ({
	...(await original<typeof import("node:fs")>()),
	writeFileSync: vi.fn(),
}));

const shared = (
	globalThis as unknown as {
		__dokployCaddySync: {
			tail: Map<string, Promise<unknown>>;
			waiting: Map<string, Promise<void>>;
			forced: Set<string>;
			applied: Map<string, string>;
			failed: Map<string, string>;
			switches: Map<string, unknown>;
			hashes: Map<string, Promise<string>>;
		};
	}
).__dokployCaddySync;
const findMany = vi.mocked(db.query.domains.findMany);
let onLoad: () => Promise<void>;
const app = {
	appName: "app",
	serverId: null as string | null,
	security: [
		{ securityId: "z", username: "zoe", password: "secret" },
		{ securityId: "a", username: "amy", password: "password" },
	],
	redirects: [2, 1].map((uniqueConfigKey) => ({
		uniqueConfigKey,
		regex: "old",
		replacement: "new",
		permanent: true,
	})),
};
const domain = (key = 1) => ({
	host: `host${key}.test`,
	https: false,
	uniqueConfigKey: key,
	enabled: true,
	path: "/api",
	internalPath: "/inside",
	stripPath: true,
	port: null,
	customEntrypoint: null as string | null,
	middlewares: [] as string[],
	forwardAuthEnabled: false,
	application: app as typeof app | null,
	compose: null as { appName: string; serverId: string | null } | null,
	previewDeployment: null as {
		appName: string;
		application: typeof app;
	} | null,
});
let rows: ReturnType<typeof domain>[];
let certs: Pick<
	Certificate,
	"certificatePath" | "certificateData" | "privateKey"
>[];
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));
const redirect = { regex: "old", replacement: "new", permanent: false };
const reload =
	"docker exec dokploy-caddy timeout 60 caddy reload --config /etc/caddy/Caddyfile";
const failure = () =>
	new ExecError("command and encoded config", {
		command: "hidden",
		stderr: "log\nError: invalid regexp\nlast log",
		stdout: "other log",
	});

beforeEach(() => {
	vi.clearAllMocks();
	for (const value of Object.values(shared)) value.clear();
	rows = [];
	certs = [];
	onLoad = async () => {};
	findMany.mockImplementation(
		(config) =>
			(async () => {
				if (config && "with" in config) {
					await onLoad();
					return rows;
				}
				return certs;
			})() as unknown as ReturnType<typeof db.query.domains.findMany>,
	);
	vi.mocked(getWebServerProvider).mockResolvedValue("caddy");
	vi.mocked(getWebServerSettings).mockResolvedValue(undefined);
	vi.mocked(execAsync).mockResolvedValue({ stdout: "", stderr: "" });
	vi.mocked(execAsyncRemote).mockResolvedValue({ stdout: "", stderr: "" });
});

it("coalesces bursts, covers late callers, and leaves no queue entries", async () => {
	const starts: number[] = [];
	let release: () => void = () => {};
	let gate = Promise.resolve();
	onLoad = async () => {
		starts.push(performance.now());
		await gate;
	};
	await Promise.all(Array.from({ length: 10 }, () => syncCaddy()));
	expect(starts.length).toBeGreaterThan(0);
	expect(starts.length).toBeLessThanOrEqual(2);
	starts.length = 0;
	gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = syncCaddy();
	await vi.waitFor(() => expect(starts).toHaveLength(1));
	const called = performance.now();
	const later = [syncCaddy(), syncCaddy()];
	release();
	await Promise.all([first, ...later]);
	expect(starts).toHaveLength(2);
	expect(starts[1]).toBeGreaterThanOrEqual(called);
	await pause();
	expect(shared.tail.size + shared.waiting.size + shared.forced.size).toBe(0);
});

it("serializes switches and applies while servers run independently", async () => {
	let active = 0;
	let max = 0;
	const work = async () => {
		active++;
		max = Math.max(max, active);
		await pause();
		active--;
	};
	onLoad = work;
	let after: Promise<void> | undefined;
	const before = syncCaddy("a");
	await vi.waitFor(() => expect(active).toBe(1), { interval: 1 });
	await Promise.all([
		before,
		withCaddyQueue("a", async () => {
			await work();
			after = syncCaddy("a");
		}),
	]);
	await after;
	expect(max).toBe(1);
	max = 0;
	await Promise.all([syncCaddy("a"), syncCaddy("b")]);
	expect(max).toBe(2);
});

it("shares force and failures, recovers, and skips unchanged text", async () => {
	await Promise.all([syncCaddy(), syncCaddy(null, true), syncCaddy()]);
	expect(execAsync).toHaveBeenCalledExactlyOnceWith(`${reload} --force`);
	await syncCaddy();
	expect(writeFileSync).toHaveBeenCalledTimes(1);
	vi.mocked(execAsync).mockRejectedValueOnce(failure());
	const results = await Promise.allSettled([
		syncCaddy(null, true),
		syncCaddy(),
	]);
	for (const result of results) {
		expect(result.status).toBe("rejected");
		if (result.status === "rejected")
			expect(result.reason.message).toBe(
				"Caddy did not load the new configuration, so it is not live. Error: invalid regexp",
			);
	}
	expect(shared.applied.size).toBe(0);
	expect(caddySyncError()).toBe("Error: invalid regexp");
	await syncCaddy();
	expect(caddySyncError()).toBeUndefined();
	expect(writeFileSync).toHaveBeenCalledTimes(3);
	expect(execAsync).toHaveBeenLastCalledWith(reload);
	await syncCaddy("remote");
	expect(writeFileRemote).toHaveBeenCalledWith(
		"remote",
		`${paths(true).MAIN_CADDY_PATH}/Caddyfile`,
		expect.any(String),
	);
});

it("does nothing when a switch took the server to Traefik while the sync waited", async () => {
	let release: () => void = () => {};
	const switching = withCaddyQueue(
		null,
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	const waiting = syncCaddy();
	await pause();
	vi.mocked(getWebServerProvider).mockResolvedValue("traefik");
	release();
	await Promise.all([switching, waiting]);
	expect(execAsync).not.toHaveBeenCalled();
	expect(writeFileSync).not.toHaveBeenCalled();
});

it("does not make a save wait for a running switch", async () => {
	let release: () => void = () => {};
	const switching = withCaddyQueue(
		null,
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	recordCaddySwitch(null, {
		target: "traefik",
		status: "running",
		message: "",
	});
	// Resolves while the switch still holds the queue.
	await syncCaddy();
	expect(execAsync).not.toHaveBeenCalled();
	recordCaddySwitch(null, {
		target: "traefik",
		status: "failed",
		message: "",
	});
	release();
	await switching;
	// The sync that was asked for runs once the switch has let go.
	await vi.waitFor(() => expect(execAsync).toHaveBeenCalledTimes(1));
});

it("shares its queue across module copies", async () => {
	vi.resetModules();
	const second = await import("@dokploy/server/utils/caddy/sync");
	const order: number[] = [];
	await Promise.all([
		withCaddyQueue("a", async () => {
			order.push(1);
			await pause();
			order.push(2);
		}),
		second.withCaddyQueue("a", async () => {
			order.push(3);
		}),
	]);
	expect(order).toEqual([1, 2, 3]);
});

it("does nothing for Traefik", async () => {
	vi.mocked(getWebServerProvider).mockResolvedValue("traefik");
	await syncCaddy();
	await assertCaddyAcceptsRedirect(null, redirect);
	expect(findMany).not.toHaveBeenCalled();
	expect(execAsync).not.toHaveBeenCalled();
	expect(execAsyncRemote).not.toHaveBeenCalled();
});

it("loads stable application and preview routes with inherited users", async () => {
	rows = [
		{
			...domain(2),
			application: null,
			previewDeployment: { appName: "preview", application: app },
		},
		domain(),
	];
	const first = await loadCaddyState();
	const [, route, preview] = first.routes;
	expect(first.routes.map((r) => r.uniqueConfigKey)).toEqual([0, 1, 2]);
	expect(route).toMatchObject({
		stripPrefix: "/api",
		addPrefix: "/inside",
		upstreams: ["app:80"],
	});
	expect(route?.redirects.map((r) => r.uniqueConfigKey)).toEqual([1, 2]);
	expect(route?.users.map((user) => user.username)).toEqual(["amy", "zoe"]);
	for (const user of route!.users) {
		const password = app.security.find(
			(row) => row.username === user.username,
		)!.password;
		expect(await bcrypt.compare(password, user.hash)).toBe(true);
	}
	expect(preview).toMatchObject({
		users: route?.users,
		redirects: [],
		upstreams: ["preview:80"],
	});
	rows.reverse();
	expect(await loadCaddyState()).toEqual(first);
	const security = [{ ...app.security[0]!, password: "changed" }];
	rows = [{ ...domain(), application: { ...app, security } }];
	const changed = await loadCaddyState();
	expect(
		await bcrypt.compare("changed", changed.routes[1]!.users[0]!.hash),
	).toBe(true);
	expect(shared.hashes.size).toBe(1);
	rows = [];
	await loadCaddyState();
	expect(shared.hashes.size).toBe(0);
	expect(execAsync).not.toHaveBeenCalled();
});

it.each([
	["/api", null, "/api"],
	["relative", "relative", null],
	["/", null, null],
])(
	"resolves app and compose prefixes for %s",
	async (internalPath, appPrefix, composePrefix) => {
		rows = [
			domain(),
			{
				...domain(2),
				application: null,
				compose: { appName: "web", serverId: null },
			},
		];
		for (const row of rows) row.internalPath = internalPath;
		vi.mocked(execAsync).mockResolvedValue({
			stdout: "/container traefik.http.routers.web-2-web.rule",
			stderr: "",
		});
		const [, ...routes] = (await loadCaddyState()).routes;
		expect(routes.map((r) => r.addPrefix)).toEqual([appPrefix, composePrefix]);
	},
);

it("filters domains and adds the dashboard only locally", async () => {
	rows = [
		domain(),
		{ ...domain(2), enabled: false },
		{ ...domain(3), customEntrypoint: "other" },
		{ ...domain(4), application: { ...app, serverId: "remote" } },
		{ ...domain(5), forwardAuthEnabled: true },
	];
	vi.mocked(getWebServerSettings).mockResolvedValue({
		host: "dashboard.test",
		https: true,
		letsEncryptEmail: "admin@test.com",
	} as Awaited<ReturnType<typeof getWebServerSettings>>);
	const local = await loadCaddyState();
	expect(local.routes.map((route) => route.uniqueConfigKey)).toEqual([0, 1, 5]);
	expect(local.routes[0]).toMatchObject({
		host: "dashboard.test",
		https: true,
		upstreams: [`dokploy:${process.env.PORT || 3000}`],
	});
	expect(local.routes[2]?.unsupported).toBe(
		"Forward auth is not available with Caddy",
	);
	const remote = await loadCaddyState("remote");
	expect(remote.email).toBe(local.email);
	expect(remote.routes.map((route) => route.uniqueConfigKey)).toEqual([4]);
});

it("serves the dashboard at Traefik's default address until a host is assigned", async () => {
	vi.mocked(getWebServerSettings).mockResolvedValue({
		host: null,
		https: true,
	} as Awaited<ReturnType<typeof getWebServerSettings>>);
	expect((await loadCaddyState()).routes).toMatchObject([
		{ host: "dokploy.docker.localhost", https: false },
	]);
	expect((await loadCaddyState("remote")).routes).toEqual([]);
});

it("looks up exact router keys and existing certificate folders", async () => {
	rows = [12, 13].map((key) => ({
		...domain(key),
		application: null,
		compose: { appName: "web", serverId: null },
	}));
	certs = ["missing", "present"].map((certificatePath) => ({
		certificatePath,
		certificateData: "cert",
		privateKey: "key",
	}));
	const output = `/replica traefik.http.routers.web-12-web.rule\nservice traefik.http.routers.web-12-web.rule\n/wrong traefik.http.routers.web-12-13-web.rule\ncertificate:${paths().CERTIFICATES_PATH}/present\n`;
	expect(
		parseCaddyLookup(output).targets.get(
			"traefik.http.routers.web-12-web.rule",
		),
	).toEqual(["replica", "service"]);
	vi.mocked(execAsync).mockResolvedValue({ stdout: output, stderr: "" });
	const loaded = await loadCaddyState();
	expect(loaded.routes).toHaveLength(2);
	expect(loaded.routes[1]).toMatchObject({
		upstreams: ["replica:80", "service:80"],
		users: [],
		redirects: [],
	});
	expect(loaded.certificates).toEqual([
		{
			certFile: `${paths().CERTIFICATES_PATH}/present/chain.crt`,
			keyFile: `${paths().CERTIFICATES_PATH}/present/privkey.key`,
			certificateData: "cert",
			privateKey: "key",
		},
	]);
	expect(execAsync).toHaveBeenCalledTimes(1);
});

it("rejects unwritable redirects and validates base64 text with Caddy", async () => {
	await expect(
		assertCaddyAcceptsRedirect(null, { ...redirect, regex: "`" }),
	).rejects.toThrow("characters Caddy cannot use");
	expect(execAsync).not.toHaveBeenCalled();
	await assertCaddyAcceptsRedirect(null, redirect);
	const command = vi.mocked(execAsync).mock.calls[0]![0];
	expect(command).toMatch(
		/^echo [A-Za-z0-9+/=]+ \| base64 -d \| docker exec -i dokploy-caddy caddy validate --adapter caddyfile --config -$/,
	);
	expect(Buffer.from(command.split(" ")[1]!, "base64").toString()).toContain(
		"(?:old)",
	);
	vi.mocked(execAsyncRemote).mockRejectedValueOnce(failure());
	await expect(
		assertCaddyAcceptsRedirect("remote", { ...redirect, regex: "(" }),
	).rejects.toThrow("Error: invalid regexp");
	vi.mocked(execAsync).mockRejectedValueOnce(
		new ExecError("command", {
			command: "hidden",
			stderr:
				"Error: loading http app module: compiling matcher regexp ^(?:()$: error parsing regexp: missing closing ): `^(?:()$`",
		}),
	);
	await expect(
		assertCaddyAcceptsRedirect(null, { ...redirect, regex: "(" }),
	).rejects.toThrow("The regex is not valid: missing closing )");
});
