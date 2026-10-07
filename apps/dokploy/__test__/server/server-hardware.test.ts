import { execFileSync, execSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { env as processEnv } from "node:process";
import {
	ENGINE_INFO_ERROR,
	getServerHardware,
	HARDWARE_PROBE_TIMEOUT_MS,
	parseNvidiaGpuLine,
	parseServerHardware,
} from "@dokploy/server/services/server-hardware";
import { buildHardwareScripts } from "@dokploy/server/services/server-hardware-scripts";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildLocalHardwareScript = () => buildHardwareScripts(false).join("\n");
const buildRemoteHardwareScript = () => buildHardwareScripts(true).join("\n");

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

vi.mock(
	"@dokploy/server/services/server-hardware-scripts",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@dokploy/server/services/server-hardware-scripts")
			>();
		return {
			...actual,
			buildHardwareScripts: vi.fn(actual.buildHardwareScripts),
		};
	},
);

const resolveBin = (name: string) =>
	execSync(`command -v ${name}`, { encoding: "utf8" }).trim();

const b64 = (value: string) => Buffer.from(value).toString("base64");

const localEnvelope = (opts: {
	engineExit?: number;
	engine?: { arch?: string };
	gpuExit?: number;
	gpuCsv?: string;
	capExit?: number;
	capCsv?: string;
}) =>
	JSON.stringify({
		kind: "local",
		engineExit: opts.engineExit ?? 0,
		engineBase64: opts.engine ? b64(JSON.stringify(opts.engine)) : "",
		gpuExit: opts.gpuExit ?? 1,
		gpuBase64: opts.gpuCsv ? b64(opts.gpuCsv) : "",
		capExit: opts.capExit ?? 1,
		capBase64: opts.capCsv ? b64(opts.capCsv) : "",
	});

const remoteEnvelope = (
	opts: {
		arch?: string;
		gpuExit?: number;
		gpuCsv?: string;
		capExit?: number;
		capCsv?: string;
	} = {},
) =>
	JSON.stringify({
		kind: "remote",
		arch: opts.arch ?? "",
		gpuExit: opts.gpuExit ?? 1,
		gpuBase64: b64(opts.gpuCsv ?? ""),
		capExit: opts.capExit ?? 1,
		capBase64: b64(opts.capCsv ?? ""),
	});

const t4 = "0, GPU-aaa, Tesla T4, 15360, 14000, 575.57.08";
const a100 = "1, GPU-bbb, NVIDIA A100-SXM4-40GB, 40960, 20000, 575.57.08";
const commaName =
	"2, GPU-ccc, NVIDIA Graphics Device, 16GB, 16384, 15000, 550.54.14";
const t4Cap = "0, 7.5";
const a100Cap = "1, 8.0";
const commaCap = "2, 8.9";

const sandboxes: string[] = [];

const makeSandbox = (bins: Record<string, string>) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-hardware-"));
	sandboxes.push(dir);
	for (const tool of ["tr", "base64"]) {
		if (bins[tool]) continue;
		const shim = path.join(dir, tool);
		symlinkSync(resolveBin(tool), shim);
	}
	for (const [name, body] of Object.entries(bins)) {
		const shim = path.join(dir, name);
		writeFileSync(shim, body);
		chmodSync(shim, 0o755);
	}
	return dir;
};

afterEach(() => {
	cloud.enabled = false;
	for (const dir of sandboxes) {
		rmSync(dir, { recursive: true, force: true });
	}
	sandboxes.length = 0;
});

const runScript = (script: string, sandboxPath: string) => {
	const stdout = execFileSync(resolveBin("sh"), ["-c", script], {
		encoding: "utf8",
		env: { ...processEnv, PATH: sandboxPath },
	});
	return JSON.stringify(
		Object.assign(
			{ kind: script.includes("docker info") ? "local" : "remote" },
			...stdout
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
		),
	);
};

describe("parseNvidiaGpuLine", () => {
	it("parses one GPU including uuid, leaving compute capability unset", () => {
		expect(parseNvidiaGpuLine(t4)).toEqual({
			index: 0,
			uuid: "GPU-aaa",
			name: "Tesla T4",
			vendor: "nvidia",
			computeCapability: null,
			memoryTotalMiB: 15360,
			memoryFreeMiB: 14000,
			driverVersion: "575.57.08",
		});
	});

	it("keeps a GPU name that contains a comma", () => {
		expect(parseNvidiaGpuLine(commaName)).toEqual({
			index: 2,
			uuid: "GPU-ccc",
			name: "NVIDIA Graphics Device, 16GB",
			vendor: "nvidia",
			computeCapability: null,
			memoryTotalMiB: 16384,
			memoryFreeMiB: 15000,
			driverVersion: "550.54.14",
		});
	});

	it("skips malformed lines", () => {
		expect(parseNvidiaGpuLine("not-a-gpu")).toBeNull();
		expect(parseNvidiaGpuLine("x,y,z")).toBeNull();
		expect(
			parseNvidiaGpuLine("0abc, GPU-aaa, Tesla T4, 15360, 14000, 575.57.08"),
		).toBeNull();
		expect(
			parseNvidiaGpuLine("-1, GPU-aaa, Tesla T4, 15360, 14000, 575.57.08"),
		).toBeNull();
	});

	it("keeps the row when VRAM is malformed instead of coercing it to 0", () => {
		expect(
			parseNvidiaGpuLine("0, GPU-aaa, Tesla T4, abc, 14000, 575.57.08"),
		).toEqual({
			index: 0,
			uuid: "GPU-aaa",
			name: "Tesla T4",
			vendor: "nvidia",
			computeCapability: null,
			memoryTotalMiB: null,
			memoryFreeMiB: 14000,
			driverVersion: "575.57.08",
		});
	});
});

beforeEach(() => {
	cloud.enabled = false;
	vi.mocked(execAsync).mockReset();
	vi.mocked(execAsyncRemote).mockReset();
	vi.mocked(buildHardwareScripts).mockReset();
});

describe("supplementary hardware parsing", () => {
	it("reads the Engine architecture when probing locally", () => {
		const result = parseServerHardware(
			localEnvelope({ engine: { arch: "x86_64" } }),
		);
		expect(result.architecture).toBe("x86_64");
		expect(result.error).toBeUndefined();
	});
	it("keeps GPU inventory when the Engine fails", () => {
		const result = parseServerHardware(
			localEnvelope({ engineExit: 1, gpuExit: 0, gpuCsv: t4 }),
		);
		expect(result.architecture).toBeNull();
		expect(result.error).toBe(ENGINE_INFO_ERROR);
		expect(result.gpu.devices[0]?.uuid).toBe("GPU-aaa");
	});
	it("merges optional compute capabilities by index when inventory order differs", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				arch: "aarch64",
				gpuExit: 0,
				gpuCsv: [t4, a100, "bad row", commaName].join("\n"),
				capExit: 0,
				capCsv: [commaCap, a100Cap, t4Cap].join("\n"),
			}),
		);
		expect(
			result.gpu.devices.map((d) => [d.index, d.computeCapability]),
		).toEqual([
			[0, "7.5"],
			[1, "8.0"],
			[2, "8.9"],
		]);
	});
	it.each(["[N/A]", "Not Supported", "", "garbage"])(
		"keeps inventory when compute capability is %s",
		(cap) => {
			const result = parseServerHardware(
				remoteEnvelope({
					gpuExit: 0,
					gpuCsv: t4,
					capExit: 0,
					capCsv: `0, ${cap}`,
				}),
			);
			expect(result.gpu.devices[0]?.computeCapability).toBeNull();
		},
	);
	it.each([
		[127, "nvidia-smi-not-found"],
		[1, "probe-failed"],
	])("ignores inventory when the command exits %s", (gpuExit, reason) => {
		const result = parseServerHardware(
			remoteEnvelope({ gpuExit: Number(gpuExit), gpuCsv: t4 }),
		);
		expect(result.gpu).toEqual({
			detection: "unavailable",
			unavailableReason: reason,
			devices: [],
		});
	});
	it("distinguishes an empty successful inventory from malformed output", () => {
		expect(parseServerHardware(remoteEnvelope({ gpuExit: 0 })).gpu).toEqual({
			detection: "available",
			devices: [],
		});
		expect(
			parseServerHardware(remoteEnvelope({ gpuExit: 0, gpuCsv: "bad row" })).gpu
				.unavailableReason,
		).toBe("invalid-output");
	});
	it.each(["garbage", "null", "[]"])(
		"degrades safely when the envelope is %s",
		(stdout) => {
			expect(parseServerHardware(stdout)).toMatchObject({
				architecture: null,
				error: "Could not parse server hardware output",
			});
		},
	);
});

describe("hardware execution", () => {
	it.each([undefined, "server-a"])(
		"uses the selected host and deadlines when serverId=%s",
		async (serverId) => {
			vi.mocked(execAsync).mockResolvedValue({
				stdout: localEnvelope({ engine: { arch: "x86_64" } }),
				stderr: "",
			});
			vi.mocked(execAsyncRemote).mockResolvedValue({
				stdout: remoteEnvelope({ arch: "aarch64" }),
				stderr: "",
			});
			const result = await getServerHardware(serverId);
			if (serverId) {
				expect(execAsyncRemote).toHaveBeenCalledWith(
					serverId,
					expect.stringContaining("uname -m"),
					undefined,
					{ timeout: HARDWARE_PROBE_TIMEOUT_MS },
				);
				expect(execAsync).not.toHaveBeenCalled();
				expect(result.architecture).toBe("aarch64");
			} else {
				expect(execAsync).toHaveBeenCalledWith(
					expect.stringContaining("docker info"),
					{ timeout: HARDWARE_PROBE_TIMEOUT_MS },
				);
				expect(execAsyncRemote).not.toHaveBeenCalled();
				expect(result.architecture).toBe("x86_64");
			}
		},
	);
	it("rejects local access when running in Cloud", async () => {
		cloud.enabled = true;
		await expect(getServerHardware()).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(execAsync).not.toHaveBeenCalled();
	});
	it("shares concurrent requests but retries after completion", async () => {
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: remoteEnvelope({ arch: "aarch64" }),
			stderr: "",
		});
		const results = await Promise.all(
			Array.from({ length: 20 }, () => getServerHardware("server-a")),
		);
		expect(new Set(results).size).toBe(1);
		expect(execAsyncRemote).toHaveBeenCalledTimes(3);
		await getServerHardware("server-a");
		expect(execAsyncRemote).toHaveBeenCalledTimes(6);
	});
	it("keeps simultaneous probes isolated by server", async () => {
		vi.mocked(execAsyncRemote).mockImplementation(async (id) => ({
			stdout: remoteEnvelope({ arch: id === "a" ? "aarch64" : "x86_64" }),
			stderr: "",
		}));
		const [a, b] = await Promise.all([
			getServerHardware("a"),
			getServerHardware("b"),
		]);
		expect([a.architecture, b.architecture]).toEqual(["aarch64", "x86_64"]);
		expect(execAsyncRemote).toHaveBeenCalledTimes(6);
	});
	it("retries when an earlier probe failed", async () => {
		vi.mocked(execAsyncRemote).mockRejectedValue(new Error("SSH failed"));
		expect((await getServerHardware("server-a")).error).toBe("SSH failed");
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: remoteEnvelope({ arch: "aarch64" }),
			stderr: "",
		});
		expect((await getServerHardware("server-a")).architecture).toBe("aarch64");
	});
	it("removes a rejected in-flight probe", async () => {
		vi.mocked(buildHardwareScripts).mockImplementationOnce(() => {
			throw new Error("scripts unavailable");
		});
		await expect(getServerHardware("server-a")).rejects.toThrow(
			"scripts unavailable",
		);
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: remoteEnvelope({ arch: "aarch64" }),
			stderr: "",
		});
		expect((await getServerHardware("server-a")).architecture).toBe("aarch64");
	});
	it("does not expose scripts or output on executor failure", async () => {
		vi.mocked(execAsyncRemote).mockImplementation(async (_id, command) => {
			throw new ExecError(`Command failed: ${command} PRIVATE`, {
				command,
				exitCode: 2,
				stderr: "PRIVATE",
			});
		});
		const result = await getServerHardware("server-a");
		expect(result.error).toBe("Hardware probe exited with code 2");
		expect(JSON.stringify(result)).not.toContain("PRIVATE");
		expect(result.gpu.detection).toBe("unavailable");
	});
});

describe("generated hardware scripts", () => {
	it.each([false, true])(
		"reports missing NVIDIA tooling honestly when remote=%s",
		(remote) => {
			const sandbox = makeSandbox({
				docker: '#!/bin/sh\nprintf \'{"arch":"x86_64"}\'',
				uname: "#!/bin/sh\nprintf aarch64",
			});
			const result = parseServerHardware(
				runScript(
					remote ? buildRemoteHardwareScript() : buildLocalHardwareScript(),
					sandbox,
				),
			);
			expect(result.architecture).toBe(remote ? "aarch64" : "x86_64");
			expect(result.gpu.unavailableReason).toBe("nvidia-smi-not-found");
		},
	);
	it.each([false, true])(
		"preserves multiple GPU rows and optional enrichment when remote=%s",
		(remote) => {
			const sandbox = makeSandbox({
				docker: '#!/bin/sh\nprintf \'{"arch":"x86_64"}\'',
				uname: "#!/bin/sh\nprintf aarch64",
				"nvidia-smi": `#!/bin/sh
case "$*" in
*compute_cap*) printf '%s\\n' '${a100Cap}' '${t4Cap}';;
*) printf '%s\\n' '${t4}' '${a100}';;
esac
`,
			});
			const result = parseServerHardware(
				runScript(
					remote ? buildRemoteHardwareScript() : buildLocalHardwareScript(),
					sandbox,
				),
			);
			expect(result.gpu.devices.map((d) => d.computeCapability)).toEqual([
				"7.5",
				"8.0",
			]);
		},
	);
	it.each([false, true])(
		"preserves each completed stage when another command hangs, remote=%s",
		async (remote) => {
			const actual = await vi.importActual<
				typeof import("@dokploy/server/utils/process/execAsync")
			>("@dokploy/server/utils/process/execAsync");
			for (const hung of ["architecture", "inventory", "compute"]) {
				const sandbox = makeSandbox({
					docker: `#!/bin/sh\n${hung === "architecture" ? "/bin/sleep 60" : ""}\nprintf '{"arch":"x86_64"}'`,
					uname: `#!/bin/sh\n${hung === "architecture" ? "/bin/sleep 60" : ""}\nprintf aarch64`,
					"nvidia-smi": `#!/bin/sh
case "$*" in
*compute_cap*) ${hung === "compute" ? "/bin/sleep 60" : ""}
printf '%s' '${t4Cap}';;
*) ${hung === "inventory" ? "/bin/sleep 60" : ""}
printf '%s' '${t4}';;
esac
`,
				});
				const execute = (command: string) =>
					actual.execAsync(command, {
						timeout: 3_000,
						env: { ...processEnv, NODE_ENV: "test", PATH: sandbox },
					});
				vi.mocked(execAsync).mockImplementation((command, options) => {
					expect(options?.timeout).toBe(HARDWARE_PROBE_TIMEOUT_MS);
					return execute(command);
				});
				vi.mocked(execAsyncRemote).mockImplementation(
					(_id, command, _onData, options) => {
						expect(options?.timeout).toBe(HARDWARE_PROBE_TIMEOUT_MS);
						return execute(command);
					},
				);
				const result = await getServerHardware(
					remote ? "fixture-server" : undefined,
				);

				expect(result.error).toContain("timed out");
				expect(result.architecture).toBe(
					hung === "architecture" ? null : remote ? "aarch64" : "x86_64",
				);
				expect(result.gpu.devices).toHaveLength(hung === "inventory" ? 0 : 1);
				if (hung === "compute")
					expect(result.gpu.devices[0]?.computeCapability).toBeNull();
			}
		},
		20_000,
	);
});
