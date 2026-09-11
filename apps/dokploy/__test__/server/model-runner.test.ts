import { execFileSync, execSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
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
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const envelope = (opts: {
	dockerPresent?: boolean;
	infoExit?: number;
	info?: unknown;
	containerStatus?: string;
}) =>
	JSON.stringify({
		dockerPresent: opts.dockerPresent ?? true,
		infoExit: opts.infoExit ?? 0,
		infoBase64: opts.info
			? Buffer.from(JSON.stringify(opts.info)).toString("base64")
			: "",
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

const info = (
	plugins: ReturnType<typeof plugin>[] | null | undefined,
	server: { version?: string; os?: string; arch?: string } = {},
) => ({
	serverVersion: server.version ?? "28.5.2",
	os: server.os ?? "linux",
	arch: server.arch ?? "amd64",
	...(plugins === undefined ? {} : { plugins }),
});

const makeSandbox = (dockerShim?: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-model-runner-"));
	for (const tool of ["tr", "base64", "printf"]) {
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

const fakeDocker = (opts: {
	info?: unknown;
	infoExit?: number;
	inspect?: string;
}) => {
	const infoJson = opts.info === undefined ? "" : JSON.stringify(opts.info);
	const infoExit = opts.infoExit ?? 0;
	const inspect =
		opts.inspect === undefined
			? "exit 1"
			: `printf '%s\\n' ${JSON.stringify(opts.inspect)}`;
	return `#!/bin/sh
if [ "$1" = "info" ]; then
	${infoJson ? `printf '%s\\n' ${JSON.stringify(infoJson)}` : ":"}
	exit ${infoExit}
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
	it("only uses docker info and inspect, and keeps docker info's exit status", () => {
		const script = buildModelRunnerScript();
		expect(script).toContain("command -v docker");
		expect(script).toContain("docker info --format");
		expect(script).toContain("infoExit=$?");
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
		["not-a-version", false],
		["2.37.3", false],
		["2.38.0", true],
		["v2.39.1", true],
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

	it("treats a present CLI with a failed docker info as an operational error", () => {
		const result = parseModelRunnerCapability(
			envelope({
				infoExit: 1,
				info: info([plugin("compose", "v2.38.0")]),
				containerStatus: "exited",
			}),
		);
		expect(result.error).toBe("Docker engine is unreachable");
		expect(result.docker.available).toBe(false);
		expect(result.compose.available).toBe(true);
		expect(result.modelRunner.standaloneRunnerContainerStatus).toBe("exited");
	});

	it("returns error for a malformed probe envelope", () => {
		const result = parseModelRunnerCapability("not-json");
		expect(result.error).toBe("Could not parse model runner probe output");
		expect(result.docker.available).toBe(false);
	});

	it("returns error for malformed docker info when the engine call succeeded", () => {
		const result = parseModelRunnerCapability(
			JSON.stringify({
				dockerPresent: true,
				infoExit: 0,
				infoBase64: Buffer.from("not-json").toString("base64"),
				containerStatus: "",
			}),
		);
		expect(result.error).toBe("Could not parse docker info output");
		expect(result.docker.available).toBe(false);
	});

	it("treats missing ClientInfo/Plugins as compose and model unavailable", () => {
		const result = parseModelRunnerCapability(
			envelope({
				info: { serverVersion: "28.5.2", os: "linux", arch: "amd64" },
			}),
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
			envelope({ info: info([...plugins]) }),
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
		["2.38.0", true],
		["v2.39.1", true],
		["v5.0.0", true],
	] as const)("compose %s => modelsSupported=%s", (version, supported) => {
		const result = parseModelRunnerCapability(
			envelope({ info: info([plugin("compose", version)]) }),
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
			envelope({ info: info([...plugins]) }),
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
				info: info([plugin("model", "v1.0.2")]),
				containerStatus: status,
			}),
		);
		expect(result.modelRunner.cliAvailable).toBe(true);
		expect(result.modelRunner.standaloneRunnerContainerStatus).toBe(expected);
	});

	it("does not leak plugin Path or unrelated docker-info fields", () => {
		const result = parseModelRunnerCapability(
			envelope({
				info: {
					...info([
						plugin("compose", "v2.38.0", undefined, {
							Path: "/usr/libexec/docker/cli-plugins/docker-compose",
							Vendor: "Docker Inc.",
						}),
						plugin("model", "v1.0.2", undefined, {
							Path: "/usr/libexec/docker/cli-plugins/docker-model",
						}),
					]),
					HttpProxy: "http://proxy.internal:8080",
					RegistryConfig: { IndexConfigs: {} },
					Labels: ["secret=1"],
				},
				containerStatus: "running",
			}),
		);
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("Path");
		expect(serialized).not.toContain("/usr/libexec");
		expect(serialized).not.toContain("Vendor");
		expect(serialized).not.toContain("proxy.internal");
		expect(serialized).not.toContain("RegistryConfig");
		expect(serialized).not.toContain("secret=1");
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

	it("records docker info's non-zero exit as an unreachable engine", () => {
		const result = parseModelRunnerCapability(
			runScript(
				makeSandbox(
					fakeDocker({
						info: info([plugin("compose", "v2.38.0")]),
						infoExit: 1,
					}),
				),
			),
		);
		expect(result.error).toBe("Docker engine is unreachable");
		expect(result.docker.available).toBe(false);
		expect(result.compose.available).toBe(true);
	});

	it("reads inspect status even when the model plugin is absent", () => {
		const result = parseModelRunnerCapability(
			runScript(
				makeSandbox(
					fakeDocker({
						info: info([plugin("compose", "v2.38.0")]),
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
		info: info([plugin("compose", "v2.38.0"), plugin("model", "v1.0.2")]),
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
			expect.stringContaining("docker info --format"),
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
