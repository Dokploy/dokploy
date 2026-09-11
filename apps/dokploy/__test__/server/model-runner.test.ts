import { execFileSync, execSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildModelRunnerScript,
	composeModelsSupported,
	getModelRunnerCapability,
	parseModelRunnerCapability,
} from "@dokploy/server/services/model-runner";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloud = { enabled: false };

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		get IS_CLOUD() {
			return cloud.enabled;
		},
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

const resolveBin = (name: string) =>
	execSync(`command -v ${name}`, { encoding: "utf8" }).trim();

const b64 = (value: unknown) =>
	Buffer.from(
		typeof value === "string" ? value : JSON.stringify(value),
	).toString("base64");

const envelope = (opts: {
	dockerPresent?: boolean;
	engineExit?: number;
	engine?: unknown;
	pluginsExit?: number;
	plugins?: unknown;
	containerStatus?: string;
}) =>
	JSON.stringify({
		dockerPresent: opts.dockerPresent ?? true,
		engineExit: opts.engineExit ?? 0,
		engineBase64: opts.engine === undefined ? "" : b64(opts.engine),
		pluginsExit: opts.pluginsExit ?? 0,
		pluginsBase64: opts.plugins === undefined ? "" : b64(opts.plugins),
		containerStatus: opts.containerStatus ?? "",
	});

const plugin = (
	name: string,
	version?: string,
	err?: unknown,
	extra: Record<string, unknown> = {},
) => ({
	Name: name,
	...(version !== undefined ? { Version: version } : {}),
	...(err !== undefined ? { Err: err } : {}),
	...extra,
});

const engine = (
	server: { version?: string; os?: string; arch?: string } = {},
) => ({
	serverVersion: server.version ?? "28.5.2",
	os: server.os ?? "linux",
	arch: server.arch ?? "amd64",
});

const sandboxes: string[] = [];

const makeSandbox = (dockerShim?: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-model-runner-"));
	sandboxes.push(dir);
	for (const tool of ["tr", "base64"]) {
		const shim = path.join(dir, tool);
		writeFileSync(shim, `#!/bin/sh\nexec ${resolveBin(tool)} "$@"\n`);
		chmodSync(shim, 0o755);
	}
	if (dockerShim) {
		const shim = path.join(dir, "docker");
		writeFileSync(shim, dockerShim);
		chmodSync(shim, 0o755);
	}
	return dir;
};

afterEach(() => {
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
	sandboxes.length = 0;
});

const fakeDocker = (opts: {
	engine?: unknown;
	engineExit?: number;
	plugins?: unknown;
	pluginsExit?: number;
	inspect?: string;
}) => {
	const engineJson =
		opts.engine === undefined ? "" : JSON.stringify(opts.engine);
	const pluginsJson =
		opts.plugins === undefined ? "" : JSON.stringify(opts.plugins);
	const inspect =
		opts.inspect === undefined
			? "exit 1"
			: `printf '%s\\n' ${JSON.stringify(opts.inspect)}`;
	return `#!/bin/sh
if [ "$1" = "info" ]; then
	case "$*" in
	*ClientInfo.Plugins*)
		${pluginsJson ? `printf '%s\\n' ${JSON.stringify(pluginsJson)}` : ":"}
		exit ${opts.pluginsExit ?? 0}
		;;
	esac
	${engineJson ? `printf '%s\\n' ${JSON.stringify(engineJson)}` : ":"}
	exit ${opts.engineExit ?? 0}
fi
if [ "$1" = "inspect" ]; then
	${inspect}
	exit 0
fi
exit 1
`;
};

const runScript = (sandboxPath: string) =>
	execFileSync(resolveBin("bash"), ["-c", buildModelRunnerScript()], {
		encoding: "utf8",
		env: { ...process.env, PATH: sandboxPath },
	});

describe("buildModelRunnerScript", () => {
	it("separates engine and plugin docker info probes and keeps their exit statuses", () => {
		const script = buildModelRunnerScript();
		expect(script).toContain("command -v docker");
		expect(script).toContain("{{json .ServerVersion}}");
		expect(script).toContain("{{json .ClientInfo.Plugins}}");
		expect(script).toContain("engineExit=$?");
		expect(script).toContain("pluginsExit=$?");
		expect(script).toContain(
			"docker inspect -f '{{.State.Status}}' docker-model-runner",
		);
		expect(script).not.toMatch(/docker info --format.*\| base64/);
		expect(script).not.toContain("docker model version");
		expect(script).not.toContain("docker compose version");
		expect(script).not.toMatch(/docker model status/);
		expect(script).not.toMatch(
			/install-runner|start-runner|restart-runner|uninstall-runner/,
		);
		expect(script).not.toContain("12434");
	});
});

describe("composeModelsSupported", () => {
	it.each([
		[null, false],
		["garbage", false],
		["2.37.3", false],
		["v2.38.0-rc.1", false],
		["2.38.0-beta.1", false],
		["2.38.0", true],
		["v2.39.1", true],
		["v2.40.3-desktop.1", true],
		["v5.0.0", true],
	] as const)("%s => %s", (version, supported) => {
		expect(composeModelsSupported(version)).toBe(supported);
	});
});

describe("parseModelRunnerCapability", () => {
	it("treats a missing Docker CLI as a normal negative, not an error", () => {
		const result = parseModelRunnerCapability(
			envelope({ dockerPresent: false }),
		);
		expect(result.error).toBeUndefined();
		expect(result.docker.available).toBe(false);
		expect(result.compose.available).toBe(false);
		expect(result.modelRunner.cliAvailable).toBe(false);
	});

	it("treats a failed engine probe as unreachable even if plugins succeed", () => {
		const result = parseModelRunnerCapability(
			envelope({
				engineExit: 1,
				plugins: [plugin("compose", "v2.38.0")],
				containerStatus: "exited",
			}),
		);
		expect(result.error).toBe("Docker engine is unreachable");
		expect(result.docker.available).toBe(false);
		expect(result.compose.available).toBe(true);
		expect(result.modelRunner.standaloneRunnerContainerStatus).toBe("exited");
	});

	it("keeps the engine available when plugin metadata fails", () => {
		const result = parseModelRunnerCapability(
			envelope({
				engine: engine(),
				pluginsExit: 1,
			}),
		);
		expect(result.error).toBeUndefined();
		expect(result.docker).toEqual({
			available: true,
			version: "28.5.2",
			os: "linux",
			arch: "amd64",
		});
		expect(result.compose.available).toBe(false);
		expect(result.modelRunner.cliAvailable).toBe(false);
	});

	it("returns error for a malformed probe envelope", () => {
		const result = parseModelRunnerCapability("not-json");
		expect(result.error).toBe("Could not parse model runner probe output");
		expect(result.docker.available).toBe(false);
	});

	it("treats missing plugins as compose and model unavailable", () => {
		const result = parseModelRunnerCapability(
			envelope({ engine: engine(), plugins: [] }),
		);
		expect(result.error).toBeUndefined();
		expect(result.docker.available).toBe(true);
		expect(result.compose.available).toBe(false);
		expect(result.modelRunner.cliAvailable).toBe(false);
	});

	it.each([
		["absent", []],
		["invalid Err", [plugin("compose", "v2.38.0", "cannot exec")]],
		["malformed version", [plugin("compose", "not-a-version")]],
	] as const)("compose plugin %s", (_name, plugins) => {
		const result = parseModelRunnerCapability(
			envelope({ engine: engine(), plugins: [...plugins] }),
		);
		if (_name === "malformed version") {
			expect(result.compose.available).toBe(true);
			expect(result.compose.version).toBe("not-a-version");
			expect(result.compose.modelsSupported).toBe(false);
			return;
		}
		expect(result.compose.available).toBe(false);
		expect(result.compose.modelsSupported).toBe(false);
		expect(result.error).toBeUndefined();
	});

	it.each([
		["2.37.3", false],
		["v2.38.0-rc.1", false],
		["2.38.0-beta.1", false],
		["2.38.0", true],
		["v2.39.1", true],
		["v2.40.3-desktop.1", true],
		["v5.0.0", true],
	] as const)("compose %s => modelsSupported=%s", (version, supported) => {
		const result = parseModelRunnerCapability(
			envelope({
				engine: engine(),
				plugins: [plugin("compose", version)],
			}),
		);
		expect(result.compose).toEqual({
			available: true,
			version,
			modelsSupported: supported,
		});
	});

	it.each([
		["absent", []],
		["invalid Err", [plugin("model", "v1.0.2", { message: "broken" })]],
	] as const)("model plugin %s", (_name, plugins) => {
		const result = parseModelRunnerCapability(
			envelope({ engine: engine(), plugins: [...plugins] }),
		);
		expect(result.modelRunner.cliAvailable).toBe(false);
		expect(result.modelRunner.cliVersion).toBeNull();
		expect(result.error).toBeUndefined();
	});

	it.each([
		["", null],
		["running", "running"],
		["exited", "exited"],
	] as const)("standalone runner %s", (status, expected) => {
		const result = parseModelRunnerCapability(
			envelope({
				engine: engine(),
				plugins: [plugin("model", "v1.0.2")],
				containerStatus: status,
			}),
		);
		expect(result.modelRunner.cliAvailable).toBe(true);
		expect(result.modelRunner.standaloneRunnerContainerStatus).toBe(expected);
	});

	it("does not leak plugin Path or unrelated docker-info fields", () => {
		const result = parseModelRunnerCapability(
			envelope({
				engine: engine(),
				plugins: [
					plugin("compose", "v2.38.0", undefined, {
						Path: "/usr/libexec/docker/cli-plugins/docker-compose",
						Vendor: "Docker Inc.",
					}),
					plugin("model", "v1.0.2", undefined, {
						Path: "/usr/libexec/docker/cli-plugins/docker-model",
					}),
				],
				containerStatus: "running",
			}),
		);
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("Path");
		expect(serialized).not.toContain("/usr/libexec");
		expect(serialized).not.toContain("Vendor");
		expect(result.modelRunner).toEqual({
			cliAvailable: true,
			cliVersion: "v1.0.2",
			standaloneRunnerContainerStatus: "running",
		});
	});
});

describe("model runner probe script", () => {
	it("reports Docker missing when the docker binary is absent", () => {
		const result = parseModelRunnerCapability(runScript(makeSandbox()));
		expect(result.error).toBeUndefined();
		expect(result.docker.available).toBe(false);
		expect(result.modelRunner.cliAvailable).toBe(false);
	});

	it("records a non-zero engine probe as unreachable", () => {
		const result = parseModelRunnerCapability(
			runScript(
				makeSandbox(
					fakeDocker({
						engineExit: 1,
						plugins: [plugin("compose", "v2.38.0")],
					}),
				),
			),
		);
		expect(result.error).toBe("Docker engine is unreachable");
		expect(result.docker.available).toBe(false);
		expect(result.compose.available).toBe(true);
	});

	it("does not report engine unreachable when only ClientInfo.Plugins fails", () => {
		const result = parseModelRunnerCapability(
			runScript(
				makeSandbox(
					fakeDocker({
						engine: engine(),
						pluginsExit: 1,
					}),
				),
			),
		);
		expect(result.error).toBeUndefined();
		expect(result.docker.available).toBe(true);
		expect(result.docker.version).toBe("28.5.2");
		expect(result.compose.available).toBe(false);
		expect(result.modelRunner.cliAvailable).toBe(false);
	});

	it("reads inspect status even when the model plugin is absent", () => {
		const result = parseModelRunnerCapability(
			runScript(
				makeSandbox(
					fakeDocker({
						engine: engine(),
						plugins: [plugin("compose", "v2.38.0")],
						inspect: "running",
					}),
				),
			),
		);
		expect(result.modelRunner.cliAvailable).toBe(false);
		expect(result.modelRunner.standaloneRunnerContainerStatus).toBe("running");
		expect(result.error).toBeUndefined();
	});
});

describe("getModelRunnerCapability", () => {
	const probeJson = envelope({
		engine: engine(),
		plugins: [plugin("compose", "v2.38.0"), plugin("model", "v1.0.2")],
		containerStatus: "running",
	});

	beforeEach(() => {
		cloud.enabled = false;
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsyncRemote).mockReset();
	});

	it("uses execAsync for the self-hosted local path and never execAsyncRemote", async () => {
		vi.mocked(execAsync).mockResolvedValue({ stdout: probeJson, stderr: "" });
		const result = await getModelRunnerCapability();
		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker info --format"),
		);
		expect(execAsyncRemote).not.toHaveBeenCalled();
		expect(result.docker.available).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("uses execAsyncRemote for a remote serverId and never execAsync", async () => {
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: probeJson,
			stderr: "",
		});
		const result = await getModelRunnerCapability("remote-server");
		expect(execAsyncRemote).toHaveBeenCalledWith(
			"remote-server",
			expect.stringContaining("{{json .ClientInfo.Plugins}}"),
		);
		expect(execAsync).not.toHaveBeenCalled();
		expect(result.modelRunner.cliAvailable).toBe(true);
	});

	it("rejects a local probe on cloud without executing docker", async () => {
		cloud.enabled = true;
		await expect(getModelRunnerCapability()).rejects.toMatchObject({
			name: "TRPCError",
			code: "BAD_REQUEST",
			message: "Server is required",
		});
		expect(execAsync).not.toHaveBeenCalled();
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("returns empty capability plus error when the remote probe throws", async () => {
		vi.mocked(execAsyncRemote).mockRejectedValue(new Error("SSH failed"));
		const result = await getModelRunnerCapability("remote-server");
		expect(result.error).toBe("SSH failed");
		expect(result.docker.available).toBe(false);
		expect(execAsync).not.toHaveBeenCalled();
	});
});
