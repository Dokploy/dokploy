import { buildComposeOverrideYaml } from "@dokploy/server/utils/builders/compose-remote-build";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	openRemoteInputSession: vi.fn(),
	findRegistryByIdWithCredentials: vi.fn(),
	findAllDeploymentsByComposeId: vi.fn(),
	logLines: [] as string[],
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	openRemoteInputSession: mocks.openRemoteInputSession,
}));
vi.mock("@dokploy/server/services/registry", () => ({
	findRegistryByIdWithCredentials: mocks.findRegistryByIdWithCredentials,
}));
vi.mock("@dokploy/server/services/deployment", () => ({
	findAllDeploymentsByComposeId: mocks.findAllDeploymentsByComposeId,
}));
vi.mock("@dokploy/server/services/compose-build-server", () => ({
	createDeploymentLogWriter: () => ({
		push: (text: string) => void mocks.logLines.push(text),
		line: (text: string) => void mocks.logLines.push(text),
		close: async () => {},
	}),
}));

import { pruneComposeBuildRegistry } from "@dokploy/server/services/compose-registry-retention";

const PASSWORD = 'S3cr3t"pa$$\\word';
const digest = (n: number) => `sha256:${n.toString(16).padStart(64, "0")}`;
const REGISTRY = "localhost:5000";
const PREFIX = "acme";

const entity = {
	appName: "my-app",
	composeId: "c1",
	serverId: null,
	sourceType: "git",
	composePath: "docker-compose.yml",
	buildServerId: "build-1",
	buildRegistryId: "reg-1",
};
const deployment = { logPath: "/logs/my-app.log", deploymentId: "current" };

/** A registry:2 stand-in: repo -> tag -> digest, plus the manifests' bodies. */
interface FakeRegistry {
	repos: Record<string, Record<string, string>>;
	bodies: Record<string, string>;
	deleted: string[];
	/** status for DELETE, default 202 */
	deleteStatus?: number;
	/** status for /v2/ , default 200 */
	pingStatus?: number;
	/** HEAD/GET of these tags fail with 500 */
	brokenTags?: string[];
	/** which scheme answers; the other one cannot connect */
	scheme: "http" | "https" | "none";
	noCurl?: boolean;
	sessionError?: Error;
	requests: { method: string; url: string }[];
}

const unquote = (value: string) => value.replace(/\\(.)/g, "$1");
const field = (block: string, key: string) => {
	const match = new RegExp(`^${key} = "((?:[^"\\\\]|\\\\.)*)"$`, "m").exec(block);
	return match ? unquote(match[1] as string) : undefined;
};

/** Reads the curl config the way curl would and answers like the registry. */
const answer = (registry: FakeRegistry, config: string) => {
	let out = "";
	for (const block of config.trim().split("\nnext\n")) {
		const id = Number(/@@DPL (\d+) /.exec(block)?.[1]);
		const url = new URL(field(block, "url") as string);
		const method = /^head$/m.test(block)
			? "HEAD"
			: (field(block, "request") ?? "GET");
		const authorized = field(block, "user") === `ci:${PASSWORD}`;
		registry.requests.push({ method, url: url.href });

		let status = 200;
		let headers = "";
		let body = "";
		const include = /^include$/m.test(block);
		const path = decodeURIComponent(url.pathname);
		if (url.protocol.slice(0, -1) !== registry.scheme) {
			status = 0;
		} else if (!authorized) {
			status = 401;
		} else if (path === "/v2/") {
			status = registry.pingStatus ?? 200;
		} else {
			const tagsMatch = /^\/v2\/(.+)\/tags\/list$/.exec(path);
			const manifestMatch = /^\/v2\/(.+)\/manifests\/(.+)$/.exec(path);
			if (tagsMatch) {
				const repo = registry.repos[tagsMatch[1] as string];
				status = repo ? 200 : 404;
				body = JSON.stringify({
					name: tagsMatch[1],
					tags: repo ? Object.keys(repo) : null,
				});
			} else if (manifestMatch) {
				const repoName = manifestMatch[1] as string;
				const reference = manifestMatch[2] as string;
				const repo = registry.repos[repoName] ?? {};
				if (method === "DELETE") {
					status = registry.deleteStatus ?? 202;
					if (status === 202) {
						registry.deleted.push(`${repoName}@${reference}`);
						for (const tag of Object.keys(repo)) {
							if (repo[tag] === reference) delete repo[tag];
						}
					}
				} else if (registry.brokenTags?.includes(reference)) {
					status = 500;
				} else if (repo[reference]) {
					headers = `HTTP/1.1 200 OK\r\nDocker-Content-Digest: ${repo[reference]}\r\n\r\n`;
					body = method === "HEAD" ? "" : (registry.bodies[repo[reference] as string] ?? "{}");
				} else {
					status = 404;
				}
			}
		}
		const printed =
			status === 0
				? ""
				: method === "HEAD"
					? headers
					: include
						? headers + body
						: body;
		out += `${printed}\n@@DPL ${id} ${String(status).padStart(3, "0")}\n`;
	}
	return out;
};

const sessions: { command: string; stdin: string }[] = [];

const installRegistry = (registry: FakeRegistry) => {
	mocks.openRemoteInputSession.mockImplementation(
		async (
			serverId: string,
			command: string,
			options?: { onStdout?: (text: string) => void },
		) => {
			if (registry.sessionError) throw registry.sessionError;
			const record = { command, stdin: "" };
			sessions.push(record);
			expect(serverId).toBe("build-1");
			return {
				write: async (data: Buffer) => {
					record.stdin += data.toString("utf8");
				},
				end: async () => {
					options?.onStdout?.(
						registry.noCurl ? "@@DPL-NOCURL\n" : answer(registry, record.stdin),
					);
				},
				abort: () => {},
			};
		},
	);
};

interface Row {
	id: string;
	/** how long before "now" its deployment was created */
	age: number;
	digest: number;
}

const NOW = Date.parse("2026-10-07T12:00:00Z");
const tagOf = (id: string) => `dpl-${id}`;
const ref = (repo: string, tag: string) => `${REGISTRY}/${PREFIX}/${repo}:${tag}`;

/**
 * Builds the registry and the serving host for one service repository
 * `my-app-web`: `rows` are the dpl- tags (oldest first by age), `latest`
 * resolves to the digest of the newest.
 */
const setup = ({
	rows,
	current,
	lastGood = [],
	preDeploy = [],
	extraRepos = {},
	bodies = {},
	registryOverrides = {},
	deploymentRows,
}: {
	rows: Row[];
	current: string[];
	lastGood?: string[];
	preDeploy?: string[];
	extraRepos?: Record<string, Record<string, string>>;
	bodies?: Record<string, string>;
	registryOverrides?: Partial<FakeRegistry>;
	deploymentRows?: {
		deploymentId: string;
		createdAt: string;
		status: string;
	}[];
}) => {
	const repo = `${PREFIX}/my-app-web`;
	const tags: Record<string, string> = {};
	for (const row of rows) tags[tagOf(row.id)] = digest(row.digest);
	const newest = [...rows].sort((a, b) => a.age - b.age)[0];
	if (newest) tags.latest = digest(newest.digest);
	const registry: FakeRegistry = {
		repos: { [repo]: tags, ...extraRepos },
		bodies,
		deleted: [],
		scheme: "http",
		requests: [],
		...registryOverrides,
	};
	installRegistry(registry);

	const files = [current, lastGood, preDeploy].map((tagsOfFile) =>
		tagsOfFile.length === 0
			? ""
			: buildComposeOverrideYaml(
					tagsOfFile.map((tag) => ({
						service: "web",
						image: ref("my-app-web", tag),
					})),
					"docker-compose",
				),
	);
	mocks.execAsync.mockResolvedValue({
		stdout: files.map((content, index) => `@@DPL-FILE /f${index}\n${content}\n`).join(""),
		stderr: "",
	});
	mocks.findAllDeploymentsByComposeId.mockResolvedValue(
		deploymentRows ?? [
			...rows.map((row) => ({
				deploymentId: row.id,
				createdAt: new Date(NOW - row.age * 60_000).toISOString(),
				status: "done",
			})),
			{
				deploymentId: "current",
				createdAt: new Date(NOW).toISOString(),
				status: "done",
			},
		],
	);
	return registry;
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.logLines.length = 0;
	sessions.length = 0;
	mocks.findRegistryByIdWithCredentials.mockResolvedValue({
		registryId: "reg-1",
		registryType: "selfHosted",
		registryUrl: REGISTRY,
		username: "ci",
		password: PASSWORD,
		imagePrefix: PREFIX,
	});
});

const run = (extra: Record<string, unknown> = {}) =>
	pruneComposeBuildRegistry({ entity, deployment, ...extra });

// Eight deployments, oldest first. Ids are random on purpose: sorted as text
// they are not in age order.
const eight: Row[] = [
	{ id: "q9", age: 80, digest: 1 },
	{ id: "b2", age: 70, digest: 1 }, // unchanged service: same digest as q9
	{ id: "zz", age: 60, digest: 2 },
	{ id: "k7", age: 50, digest: 3 },
	{ id: "m1", age: 40, digest: 2 }, // shares zz's digest and is kept
	{ id: "a0", age: 30, digest: 4 },
	{ id: "x5", age: 20, digest: 5 },
	{ id: "c3", age: 10, digest: 6 }, // newest: shares its digest with latest
];

describe("pruneComposeBuildRegistry", () => {
	it("deletes the digests of old dpl- tags no kept tag resolves to", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		await run();

		// q9 and b2 share digest 1 and nothing kept uses it: deleted, once.
		// zz shares digest 2 with the kept m1: held back.
		expect(registry.deleted).toEqual([`${PREFIX}/my-app-web@${digest(1)}`]);
		expect(registry.repos[`${PREFIX}/my-app-web`]).toMatchObject({
			latest: digest(6),
			[tagOf("zz")]: digest(2),
			[tagOf("m1")]: digest(2),
		});
		expect(mocks.logLines.join("\n")).toContain(
			"removed 1 old image manifest (2 dpl- tags)",
		);
	});

	it("never deletes the digest that latest shares with the newest dpl- tag", async () => {
		// Six tags, one old: the old tag shares its digest with latest.
		const rows: Row[] = [
			{ id: "old", age: 90, digest: 9 },
			{ id: "a", age: 50, digest: 1 },
			{ id: "b", age: 40, digest: 2 },
			{ id: "c", age: 30, digest: 3 },
			{ id: "d", age: 20, digest: 4 },
			{ id: "e", age: 10, digest: 9 },
		];
		const registry = setup({ rows, current: [tagOf("e")] });
		await run();
		expect(registry.deleted).toEqual([]);
		expect(registry.repos[`${PREFIX}/my-app-web`]?.[tagOf("old")]).toBe(digest(9));
	});

	it("does nothing and makes no delete call with fewer than five dpl- tags", async () => {
		const registry = setup({ rows: eight.slice(-4), current: [tagOf("c3")] });
		await run();
		expect(registry.deleted).toEqual([]);
		expect(registry.requests.some((r) => r.method === "DELETE")).toBe(false);
		expect(mocks.logLines).toEqual([]);
	});

	it("keeps the tags of the last-good override even when older than the five newest", async () => {
		const rows = eight.map((row) =>
			row.id === "b2" ? { ...row, digest: 7 } : row,
		);
		const registry = setup({
			rows,
			current: [tagOf("c3")],
			lastGood: [tagOf("q9")], // the oldest tag is the rollback target
		});
		await run();
		// q9 stays (protected), so does its digest; b2 (digest 7) is the only
		// deletable one; zz shares digest 2 with m1.
		expect(registry.deleted).toEqual([`${PREFIX}/my-app-web@${digest(7)}`]);
		expect(registry.repos[`${PREFIX}/my-app-web`]?.[tagOf("q9")]).toBe(digest(1));
	});

	it("keeps the pre-deploy snapshot's tags too", async () => {
		const rows = eight.map((row) =>
			row.id === "b2" ? { ...row, digest: 7 } : row,
		);
		const registry = setup({
			rows,
			current: [tagOf("c3")],
			preDeploy: [tagOf("b2")],
		});
		await run();
		expect(registry.deleted).not.toContain(`${PREFIX}/my-app-web@${digest(7)}`);
	});

	it("keeps a digest that a kept manifest list contains", async () => {
		const rows = eight.map((row) =>
			row.id === "b2" ? { ...row, digest: 7 } : row,
		);
		// the kept c3 / latest tag is an index whose child is b2's digest
		const registry = setup({
			rows,
			current: [tagOf("c3")],
			bodies: { [digest(6)]: JSON.stringify({ manifests: [{ digest: digest(7) }] }) },
		});
		await run();
		expect(registry.deleted).toEqual([`${PREFIX}/my-app-web@${digest(1)}`]);
	});

	it("treats services that share one image as one repository", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		// web and worker run the same pushed image: one override entry per service
		const yaml = buildComposeOverrideYaml(
			[
				{ service: "web", image: ref("my-app-web", tagOf("c3")) },
				{ service: "worker", image: ref("my-app-web", tagOf("c3")) },
			],
			"docker-compose",
		);
		mocks.execAsync.mockResolvedValue({
			stdout: `@@DPL-FILE /f0\n${yaml}\n@@DPL-FILE /f1\n\n@@DPL-FILE /f2\n\n`,
			stderr: "",
		});
		await run();
		const listings = registry.requests.filter((r) => r.url.includes("/tags/list"));
		expect(listings).toHaveLength(1);
		expect(registry.deleted).toEqual([`${PREFIX}/my-app-web@${digest(1)}`]);
	});

	it("processes every service repository of the compose", async () => {
		const api = Object.fromEntries(
			eight.map((row) => [tagOf(row.id), digest(100 + row.digest)]),
		);
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			extraRepos: { [`${PREFIX}/my-app-api`]: { ...api, latest: digest(106) } },
		});
		mocks.execAsync.mockResolvedValue({
			stdout: `@@DPL-FILE /f0\n${buildComposeOverrideYaml(
				[
					{ service: "web", image: ref("my-app-web", tagOf("c3")) },
					{ service: "api", image: ref("my-app-api", tagOf("c3")) },
				],
				"docker-compose",
			)}\n@@DPL-FILE /f1\n\n@@DPL-FILE /f2\n\n`,
			stderr: "",
		});
		mocks.findAllDeploymentsByComposeId.mockResolvedValue([
			...eight.map((row) => ({
				deploymentId: row.id,
				createdAt: new Date(NOW - row.age * 60_000).toISOString(),
				status: "done",
			})),
		]);
		await run();
		expect(registry.deleted.sort()).toEqual([
			`${PREFIX}/my-app-api@${digest(101)}`,
			`${PREFIX}/my-app-web@${digest(1)}`,
		]);
	});

	it("leaves repositories alone that no override of this compose references", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			// another compose whose app name merely starts the same way
			extraRepos: {
				[`${PREFIX}/my-app-web-extra`]: Object.fromEntries(
					eight.map((row) => [tagOf(row.id), digest(200 + row.digest)]),
				),
			},
		});
		await run();
		expect(registry.requests.every((r) => !r.url.includes("my-app-web-extra"))).toBe(
			true,
		);
	});

	it("ignores references that point at a different registry", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		mocks.execAsync.mockResolvedValue({
			stdout: `@@DPL-FILE /f0\n${buildComposeOverrideYaml(
				[{ service: "web", image: `other.example.com/${PREFIX}/my-app-web:${tagOf("c3")}` }],
				"docker-compose",
			)}\n`,
			stderr: "",
		});
		await run();
		expect(registry.requests).toEqual([]);
	});

	it("skips a repository when a kept tag cannot be read", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { brokenTags: ["latest"] },
		});
		await run();
		expect(registry.deleted).toEqual([]);
		expect(mocks.logLines.join("\n")).toContain("could not read every kept tag");
	});

	it("falls back to https when the tunnelled http endpoint is not there", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { scheme: "https" },
		});
		await run();
		expect(registry.deleted).toEqual([`${PREFIX}/my-app-web@${digest(1)}`]);
		expect(registry.requests.filter((r) => r.url.includes("/tags/list"))[0]?.url).toMatch(
			/^https:/,
		);
	});

	it("bounds the manifests deleted per run", async () => {
		const many: Row[] = Array.from({ length: 80 }, (_, index) => ({
			id: `t${index}`,
			age: 1000 - index,
			digest: index + 1,
		}));
		const registry = setup({ rows: many, current: [tagOf("t79")] });
		await run();
		expect(registry.deleted).toHaveLength(50);
		// oldest first
		expect(registry.deleted[0]).toBe(`${PREFIX}/my-app-web@${digest(1)}`);
	});

	it("defers while another deployment of the compose is running", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			deploymentRows: [
				{ deploymentId: "current", createdAt: new Date(NOW).toISOString(), status: "done" },
				{
					deploymentId: "other",
					createdAt: new Date(Date.now() - 60_000).toISOString(),
					status: "running",
				},
			],
		});
		await run();
		expect(registry.requests).toEqual([]);
		expect(mocks.logLines.join("\n")).toContain("another deployment of this compose is running");
	});

	it("does not delete when a deploy starts while the cleanup is running", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		const done = await mocks.findAllDeploymentsByComposeId();
		mocks.findAllDeploymentsByComposeId
			.mockResolvedValueOnce(done)
			.mockResolvedValue([
				...done,
				{
					deploymentId: "late",
					createdAt: new Date().toISOString(),
					status: "running",
				},
			]);
		await run();
		expect(registry.deleted).toEqual([]);
		expect(registry.requests.some((r) => r.method === "DELETE")).toBe(false);
		expect(mocks.logLines.join("\n")).toContain("another deployment of this compose started");
	});

	it("is not blocked by an abandoned 'running' row", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			deploymentRows: [
				...eight.map((row) => ({
					deploymentId: row.id,
					createdAt: new Date(NOW - row.age * 60_000).toISOString(),
					status: "done",
				})),
				{
					deploymentId: "stale",
					createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
					status: "running",
				},
			],
		});
		await run();
		expect(registry.deleted).toHaveLength(1);
	});
});

describe("units without a build server", () => {
	it("does no I/O at all", async () => {
		await pruneComposeBuildRegistry({
			entity: { ...entity, buildServerId: null, buildRegistryId: null },
			deployment,
		});
		await pruneComposeBuildRegistry({
			entity: { ...entity, buildServerId: null },
			deployment,
		});
		expect(mocks.findRegistryByIdWithCredentials).not.toHaveBeenCalled();
		expect(mocks.findAllDeploymentsByComposeId).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.openRemoteInputSession).not.toHaveBeenCalled();
		expect(mocks.logLines).toEqual([]);
	});
});

describe("failures never fail the deploy", () => {
	const warned = () => mocks.logLines.join("\n");

	it("401: warns and deletes nothing", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { pingStatus: 401 },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(registry.deleted).toEqual([]);
		expect(warned()).toContain("Warning");
		expect(warned()).toContain("401");
	});

	it("wrong stored credentials answer 401 too", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			registryType: "selfHosted",
			registryUrl: REGISTRY,
			username: "ci",
			password: "wrong",
		});
		await expect(run()).resolves.toBeUndefined();
		expect(registry.deleted).toEqual([]);
		expect(warned()).toContain("refused the stored credentials");
	});

	it("405: delete disabled is reported once and stops", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { deleteStatus: 405 },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(registry.deleted).toEqual([]);
		expect(warned()).toContain("REGISTRY_STORAGE_DELETE_ENABLED");
		expect(warned().match(/Warning/g)).toHaveLength(1);
	});

	it("registry without the v2 API (404 on the check)", async () => {
		setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { pingStatus: 404 },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("Warning");
	});

	it("unreachable registry", async () => {
		const registry = setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { scheme: "none" },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(registry.deleted).toEqual([]);
		expect(warned()).toContain("could not be reached");
	});

	it("the SSH session itself fails", async () => {
		setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { sessionError: new Error("ssh: connection reset") },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("connection reset");
	});

	it("curl is missing on the build server", async () => {
		setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: { noCurl: true },
		});
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("curl is not installed");
	});

	it("reading the release files fails", async () => {
		setup({ rows: eight, current: [tagOf("c3")] });
		mocks.execAsync.mockRejectedValue(new Error("boom"));
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("boom");
		expect(mocks.openRemoteInputSession).not.toHaveBeenCalled();
	});

	it("the deployment table is unavailable", async () => {
		setup({ rows: eight, current: [tagOf("c3")] });
		mocks.findAllDeploymentsByComposeId.mockRejectedValue(new Error("db down"));
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("db down");
	});

	it("the registry row is gone", async () => {
		setup({ rows: eight, current: [tagOf("c3")] });
		mocks.findRegistryByIdWithCredentials.mockRejectedValue(new Error("Registry not found"));
		await expect(run()).resolves.toBeUndefined();
		expect(warned()).toContain("Registry not found");
	});

	it("gives up when the time budget is spent", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		await expect(run({ budgetMs: 0 })).resolves.toBeUndefined();
		expect(registry.deleted).toEqual([]);
		expect(warned()).toContain("Warning");
	});

	it("skips ECR registries", async () => {
		setup({ rows: eight, current: [tagOf("c3")] });
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			registryType: "awsEcr",
			registryUrl: "123.dkr.ecr.eu-west-1.amazonaws.com",
		});
		await run();
		expect(mocks.openRemoteInputSession).not.toHaveBeenCalled();
		expect(warned()).toContain("AWS ECR");
	});

	it("skips a registry without a url", async () => {
		setup({ rows: eight, current: [tagOf("c3")] });
		mocks.findRegistryByIdWithCredentials.mockResolvedValue({
			registryType: "cloud",
			registryUrl: "",
		});
		await run();
		expect(mocks.openRemoteInputSession).not.toHaveBeenCalled();
	});
});

describe("credentials", () => {
	it("travel on stdin only: never in a command, an argument or a log line", async () => {
		const registry = setup({ rows: eight, current: [tagOf("c3")] });
		await run();
		expect(registry.deleted).toHaveLength(1);

		// every session was authenticated through its stdin config...
		expect(sessions.length).toBeGreaterThanOrEqual(4);
		for (const session of sessions) {
			expect(session.stdin).toContain("user = ");
			expect(session.stdin).toContain("ci:");
		}
		// ...and the password is in none of the commands that were executed
		const commands = [
			...sessions.map((s) => s.command),
			...mocks.execAsync.mock.calls.map((call) => String(call[0])),
			...mocks.execAsyncRemote.mock.calls.map((call) => String(call[1])),
			...mocks.openRemoteInputSession.mock.calls.map((call) => String(call[1])),
		];
		for (const command of commands) {
			expect(command).not.toContain(PASSWORD);
			expect(command).not.toContain("S3cr3t");
		}
		expect(mocks.logLines.join("\n")).not.toContain("S3cr3t");
	});

	it("are redacted from a failure message", async () => {
		setup({
			rows: eight,
			current: [tagOf("c3")],
			registryOverrides: {
				sessionError: new Error(`curl said no to ${PASSWORD}`),
			},
		});
		await run();
		expect(mocks.logLines.join("\n")).not.toContain("S3cr3t");
		expect(mocks.logLines.join("\n")).toContain("***");
	});
});
