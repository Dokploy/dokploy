import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { readPorts } from "@dokploy/server/services/settings";
import { setWebServerProvider } from "@dokploy/server/services/web-server-settings";
import {
	checkWebServerSwitch,
	switchWebServer,
} from "@dokploy/server/setup/caddy-setup";
import {
	getDefaultMiddlewares,
	getDefaultServerTraefikConfig,
	initializeStandaloneTraefik,
} from "@dokploy/server/setup/traefik-setup";
import { caddySwitch } from "@dokploy/server/utils/caddy/sync";
import {
	ExecError,
	execAsyncRemote,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
	sleep: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/services/web-server-settings")
	>()),
	getWebServerSettings: vi.fn(),
	getWebServerProvider: vi.fn(async () => provider),
	setWebServerProvider: vi.fn(async (next: string) => {
		provider = next;
	}),
}));
vi.mock("@dokploy/server/services/settings", async (original) => ({
	...(await original<typeof import("@dokploy/server/services/settings")>()),
	getDockerResourceType: vi.fn(async () => traefikContainer),
	readPorts: vi.fn(async () => []),
	reconnectServicesToTraefik: vi.fn(),
}));
vi.mock("@dokploy/server/setup/traefik-setup", async (original) => ({
	...(await original<typeof import("@dokploy/server/setup/traefik-setup")>()),
	initializeStandaloneTraefik: vi.fn(),
}));

const SERVER = "remote";
const root = paths(true).MAIN_CADDY_PATH;
const traefikRoot = paths(true).MAIN_TRAEFIK_PATH;
const application = {
	appName: "app",
	serverId: SERVER,
	security: [] as { username: string; password: string }[],
	redirects: [] as {
		uniqueConfigKey: number;
		regex: string;
		replacement: string;
		permanent: boolean;
	}[],
	previewDeployments: [],
};
const domain = (key: number, overrides: object = {}) => ({
	host: `host${key}.test`,
	uniqueConfigKey: key,
	applicationId: "app-id",
	application,
	compose: null as { appName: string; serverId: string } | null,
	previewDeployment: null,
	enabled: true,
	https: false,
	path: "/",
	internalPath: "/",
	stripPath: false,
	port: 80,
	customEntrypoint: null,
	middlewares: [] as string[],
	forwardAuthEnabled: false,
	certificateType: "none",
	...overrides,
});

// What the server looks like to the code under test.
let provider: string;
let rows: ReturnType<typeof domain>[];
let traefikFiles: Record<string, string>;
// Every running container with its labels.
let containers: Record<string, Record<string, string>>;
let script: () => string;
let docker: string;
let caddyAccepts: boolean;
let traefikContainer: string;
let written: Record<string, string>;
let providerWhenScriptRan: string;

beforeEach(() => {
	vi.clearAllMocks();
	(
		globalThis as unknown as {
			__dokployCaddySync: { switches: Map<string, unknown> };
		}
	).__dokployCaddySync.switches.clear();
	provider = "traefik";
	rows = [domain(1)];
	traefikFiles = {
		"traefik.yml": getDefaultServerTraefikConfig(),
		"dynamic/middlewares.yml": getDefaultMiddlewares(),
	};
	containers = {};
	application.redirects = [];
	script = () => "Caddy is serving";
	docker = "/dokploy-caddy running always\n/dokploy-traefik exited no";
	caddyAccepts = true;
	traefikContainer = "standalone";
	written = {};
	vi.mocked(db.query.domains.findMany).mockImplementation(((config: {
		with?: object;
	}) =>
		Promise.resolve(
			!config?.with
				? []
				: "previewDeployments" in config.with
					? [application]
					: rows,
		)) as never);
	const traefikFile = (file: string) =>
		file.startsWith(`${traefikRoot}/`)
			? file.slice(traefikRoot.length + 1)
			: undefined;
	vi.mocked(writeFileRemote).mockImplementation(async (_, file, content) => {
		written[file] = content;
		const name = traefikFile(file);
		if (name) traefikFiles[name] = content;
	});
	vi.mocked(execAsyncRemote).mockImplementation(async (_, command) => {
		const reply = (stdout: string) => ({ stdout, stderr: "" });
		if (command.includes("for file in traefik.yml")) {
			return reply(
				Object.entries(traefikFiles)
					.map(
						([name, content]) =>
							`${name}\t${Buffer.from(content).toString("base64")}`,
					)
					.join("\n"),
			);
		}
		if (command.includes("{{json .Config.Labels}}")) {
			return reply(
				Object.entries(containers)
					.map(([name, labels]) => `/${name} ${JSON.stringify(labels)}`)
					.join("\n"),
			);
		}
		if (command.includes("docker ps -q")) {
			return reply(
				Object.entries(containers)
					.map(([name, labels]) => `/${name} ${Object.keys(labels).join(" ")}`)
					.join("\n"),
			);
		}
		if (command.startsWith("caddy=")) {
			providerWhenScriptRan = provider;
			return reply(script());
		}
		if (command.includes(".HostConfig.RestartPolicy.Name"))
			return reply(docker);
		if (command.startsWith("cat ")) {
			return reply(traefikFiles[traefikFile(command.slice(4)) ?? ""] ?? "");
		}
		if (/caddy (validate|reload)/.test(command) && !caddyAccepts) {
			throw new ExecError("failed", {
				command,
				stderr: "log line\nError: sites/custom.caddy:1: unrecognized directive",
			});
		}
		return reply("");
	});
});

const settled = () =>
	vi.waitFor(() => {
		const outcome = caddySwitch(SERVER);
		expect(outcome?.status).not.toBe("running");
		return outcome;
	});

describe("the dry run", () => {
	it("blocks on every setting Caddy cannot honour and on a refused route", async () => {
		rows = [
			domain(1, { forwardAuthEnabled: true }),
			domain(2, { middlewares: ["private"] }),
			domain(3, { customEntrypoint: "other" }),
			domain(4, { certificateType: "custom" }),
			domain(5, { path: "/a`b" }),
			domain(6, { enabled: false, forwardAuthEnabled: true }),
		];
		const { blockers } = await checkWebServerSwitch("caddy", SERVER);
		expect(blockers).toEqual([
			"host1.test: Forward auth is not available with Caddy.",
			"host2.test: A custom middleware is not available with Caddy.",
			"host3.test: A custom entrypoint is not available with Caddy.",
			"host4.test: A custom certificate resolver is not available with Caddy.",
			"host5.test/a`b: its host, a path, a redirect or a user name cannot be written in a Caddyfile.",
		]);
	});

	it("blocks when Caddy rejects the candidate, with Caddy's own message", async () => {
		caddyAccepts = false;
		const { blockers } = await checkWebServerSwitch("caddy", SERVER);
		expect(blockers).toEqual([
			"Caddy rejects the configuration. Error: sites/custom.caddy:1: unrecognized directive",
		]);
		expect(written[`${root}/Caddyfile.check`]).toContain("host1.test");
		expect(written[`${root}/Caddyfile`]).toBeUndefined();
	});

	it("asks to accept what Traefik does that did not come from Dokploy", async () => {
		traefikFiles["dynamic/mine.yml"] = "http: {}";
		containers.blog = {
			"traefik.enable": "true",
			"traefik.http.routers.blog.rule": "Host(`blog.test`)",
		};
		vi.mocked(readPorts).mockResolvedValueOnce([
			{ targetPort: 80, publishedPort: 80, protocol: "tcp" },
			{ targetPort: 8080, publishedPort: 8080, protocol: "tcp" },
		]);
		const { acknowledge } = await checkWebServerSwitch("caddy", SERVER);
		expect(acknowledge).toEqual([
			"dynamic/mine.yml was not written by Dokploy. Caddy will not read it.",
			"blog has Traefik labels that do not come from a domain in Dokploy: traefik.http.routers.blog.rule. Caddy will not apply them.",
			"Traefik also publishes 8080/tcp. Caddy will not.",
		]);
	});

	it("warns about HTTPS hosts without a certificate to take over, redirects that are not anchored, and compose domains with nothing running", async () => {
		application.redirects = [
			{
				uniqueConfigKey: 9,
				regex: "old|new",
				replacement: "new",
				permanent: true,
			},
		];
		rows = [
			domain(1, { https: true, certificateType: "letsencrypt" }),
			domain(2, { compose: { appName: "shop", serverId: SERVER } }),
			// No certificate provider: answered with Caddy's own certificate
			// until it has another, as Traefik does with its self-signed one.
			domain(3, { https: true }),
		];
		const { warnings } = await checkWebServerSwitch("caddy", SERVER);
		expect(warnings).toEqual([
			"Traefik holds no certificate Caddy can take over for host1.test. Caddy asks Let's Encrypt for one when it starts, and until it has one these hosts do not answer over HTTPS, where Traefik answers with a self-signed certificate. For a domain Let's Encrypt cannot validate, set the certificate provider to None, which keeps that behaviour.",
			"The redirect old|new does not start with ^. If it matches a URL more than once, Traefik replaces every match and Caddy only the first.",
			"host2.test has no running container, so it gets its route at that compose's next deploy.",
		]);
	});

	it("reports a missing Traefik container as a blocker", async () => {
		traefikContainer = "unknown";
		const { blockers } = await checkWebServerSwitch("caddy", SERVER);
		expect(blockers).toEqual([
			"The Traefik container was not found on this server.",
		]);
	});
});

describe("the switch", () => {
	it("is refused on a blocker, and on items nobody accepted", async () => {
		traefikFiles["dynamic/mine.yml"] = "http: {}";
		await expect(switchWebServer("caddy", SERVER, false)).rejects.toThrow(
			"Accept that before switching",
		);
		rows = [domain(1, { forwardAuthEnabled: true })];
		await expect(switchWebServer("caddy", SERVER, true)).rejects.toThrow(
			"Forward auth",
		);
		expect(setWebServerProvider).not.toHaveBeenCalled();
	});

	it("records Caddy before the script runs and applies once it serves", async () => {
		await switchWebServer("caddy", SERVER, false);
		expect(await settled()).toEqual({
			target: "caddy",
			status: "done",
			message: "Caddy is serving",
		});
		expect(providerWhenScriptRan).toBe("caddy");
		expect(provider).toBe("caddy");
		expect(written[`${root}/Caddyfile`]).toContain("host1.test");
		expect(execAsyncRemote).toHaveBeenLastCalledWith(
			SERVER,
			expect.stringContaining(
				"caddy reload --config /etc/caddy/Caddyfile --force",
			),
		);
	});

	it("follows Docker back to Traefik when the script fails, with Caddy's error and not its log", async () => {
		script = () => {
			throw new ExecError("failed", {
				command: "script",
				stderr:
					'{"level":"info","msg":"maxprocs: Leaving GOMAXPROCS=8"}\nError: adapting config using caddyfile: ambiguous site definition: https://a.test\n{"level":"info","msg":"another line"}\nCaddy did not start, so Traefik is serving again\n',
			});
		};
		docker = "/dokploy-traefik running always";
		await switchWebServer("caddy", SERVER, false);
		expect(await settled()).toEqual({
			target: "caddy",
			status: "failed",
			message:
				"Error: adapting config using caddyfile: ambiguous site definition: https://a.test\nCaddy did not start, so Traefik is serving again\nTraefik is serving",
		});
		expect(provider).toBe("traefik");
	});

	it("waits for a script that outlived its connection", async () => {
		script = () => {
			throw new Error("SSH connection error");
		};
		const answers = [
			"switching\n/dokploy-traefik running no",
			"switching\n/dokploy-caddy running no",
			"/dokploy-caddy running always",
		];
		const dispatch = vi.mocked(execAsyncRemote).getMockImplementation();
		vi.mocked(execAsyncRemote).mockImplementation(async (id, command) =>
			command.includes(".HostConfig.RestartPolicy.Name")
				? {
						stdout: answers.shift() ?? "/dokploy-caddy running always",
						stderr: "",
					}
				: (dispatch as NonNullable<typeof dispatch>)(id, command),
		);
		await switchWebServer("caddy", SERVER, false);
		expect((await settled())?.status).toBe("done");
		expect(provider).toBe("caddy");
	});

	it("trusts Docker over a marker that a killed script left behind", async () => {
		script = () => {
			throw new Error("SSH connection error");
		};
		docker = "switching\n/dokploy-traefik running always";
		await switchWebServer("caddy", SERVER, false);
		expect(await settled()).toMatchObject({
			status: "failed",
			message: "SSH connection error\nTraefik is serving",
		});
		expect(provider).toBe("traefik");
	});

	it("keeps the column on Caddy until Docker confirms Traefik on the way back", async () => {
		provider = "caddy";
		script = () => "Traefik is serving";
		docker = "/dokploy-traefik running always";
		await switchWebServer("traefik", SERVER, false);
		expect((await settled())?.status).toBe("done");
		expect(providerWhenScriptRan).toBe("caddy");
		expect(provider).toBe("traefik");
	});

	it("refuses a second switch while one is being checked", async () => {
		const first = switchWebServer("caddy", SERVER, false);
		await expect(switchWebServer("caddy", SERVER, false)).rejects.toThrow(
			"already running",
		);
		await first;
		await settled();
	});

	it("puts Caddy back, and Traefik out of the way, when the way back leaves neither serving", async () => {
		provider = "caddy";
		script = () => {
			throw new Error("SSH connection error");
		};
		docker = "/dokploy-traefik restarting always";
		const dispatch = vi.mocked(execAsyncRemote).getMockImplementation();
		const commands: string[] = [];
		vi.mocked(execAsyncRemote).mockImplementation(async (id, command) => {
			if (command.includes("docker start dokploy-caddy")) {
				commands.push(command);
				docker = "/dokploy-caddy running always\n/dokploy-traefik exited no";
			}
			return (dispatch as NonNullable<typeof dispatch>)(id, command);
		});
		await switchWebServer("traefik", SERVER, false);
		expect(await settled()).toMatchObject({
			status: "failed",
			message: "SSH connection error\nCaddy is serving",
		});
		expect(commands).toEqual([
			"docker stop dokploy-traefik >/dev/null 2>&1\ndocker update --restart no dokploy-traefik >/dev/null 2>&1\ndocker update --restart always dokploy-caddy && docker start dokploy-caddy",
		]);
		expect(provider).toBe("caddy");
	});

	it("keeps the column on Caddy when Docker confirms neither proxy", async () => {
		script = () => {
			throw new Error("SSH connection error");
		};
		docker = "";
		await switchWebServer("caddy", SERVER, false);
		expect(await settled()).toMatchObject({ status: "failed" });
		expect(provider).toBe("caddy");
	});

	it("recreates a Traefik container that Docker's cleanup removed", async () => {
		provider = "caddy";
		script = () => "missing\n";
		docker = "/dokploy-traefik running always";
		await switchWebServer("traefik", SERVER, false);
		expect((await settled())?.message).toContain("created again");
		expect(initializeStandaloneTraefik).toHaveBeenCalledWith({
			serverId: SERVER,
		});
		expect(provider).toBe("traefik");
	});
});
