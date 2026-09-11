import { execFileSync, execSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildLocalHardwareScript,
	buildRemoteHardwareScript,
	getServerHardware,
	parseNvidiaGpuLine,
	parseServerHardware,
} from "@dokploy/server/services/server-hardware";
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

const b64 = (value: string) => Buffer.from(value).toString("base64");

const localEnvelope = (opts: {
	engineExit?: number;
	engine?: { ncpu?: number; memTotal?: number; arch?: string };
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

const remoteEnvelope = (opts: {
	memTotalKb?: string;
	memAvailKb?: string;
	cpuCount?: string;
	arch?: string;
	diskTotalK?: string;
	diskAvailK?: string;
	diskExit?: number;
	gpuExit?: number;
	gpuCsv?: string;
	capExit?: number;
	capCsv?: string;
}) =>
	JSON.stringify({
		kind: "remote",
		memTotalKb: opts.memTotalKb ?? "",
		memAvailKb: opts.memAvailKb ?? "",
		cpuCount: opts.cpuCount ?? "",
		arch: opts.arch ?? "",
		diskTotalK: opts.diskTotalK ?? "",
		diskAvailK: opts.diskAvailK ?? "",
		diskExit: opts.diskExit ?? 0,
		gpuExit: opts.gpuExit ?? 1,
		gpuBase64: opts.gpuCsv ? b64(opts.gpuCsv) : "",
		capExit: opts.capExit ?? 1,
		capBase64: opts.capCsv ? b64(opts.capCsv) : "",
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
	for (const tool of ["tr", "base64", "printf"]) {
		if (bins[tool]) continue;
		const shim = path.join(dir, tool);
		writeFileSync(shim, `#!/bin/sh\nexec ${resolveBin(tool)} "$@"\n`);
		chmodSync(shim, 0o755);
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

const runScript = (script: string, sandboxPath: string) =>
	execFileSync(resolveBin("sh"), ["-c", script], {
		encoding: "utf8",
		env: { ...process.env, PATH: sandboxPath },
	});

const inventoryQueries = (script: string) =>
	[...script.matchAll(/nvidia-smi --query-gpu=(\S+)/g)].map(
		(match) => match[1],
	);

describe("hardware scripts", () => {
	it("does not use container free/nproc/df or /proc/meminfo locally", () => {
		const script = buildLocalHardwareScript();
		expect(script).toContain("docker info --format");
		expect(inventoryQueries(script)).toEqual([
			"index,uuid,name,memory.total,memory.free,driver_version",
			"index,compute_cap",
		]);
		expect(script).not.toContain("$(free");
		expect(script).not.toContain("free -");
		expect(script).not.toContain("$(nproc");
		expect(script).not.toContain("nproc ");
		expect(script).not.toContain("/proc/meminfo");
		expect(script).not.toContain("df -P /");
		expect(script).not.toContain("df -Pk /");
		expect(script).not.toContain("DockerRootDir");
	});

	it("reads remote host /proc and root df -Pk, not DockerRootDir", () => {
		const script = buildRemoteHardwareScript();
		expect(script).toContain("/proc/meminfo");
		expect(script).toContain("df -Pk /");
		expect(script).toContain("diskOutput=$(df -Pk /");
		expect(script).toContain("diskExit=$?");
		expect(script).not.toMatch(/df -P \//);
		expect(script).toContain("uname -m");
		expect(script).not.toContain("DockerRootDir");
		expect(inventoryQueries(script)).toEqual([
			"index,uuid,name,memory.total,memory.free,driver_version",
			"index,compute_cap",
		]);
	});
});

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

describe("parseServerHardware", () => {
	it("reads local Docker Engine facts and leaves available memory and disk null", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 8, memTotal: 16_000_000_000, arch: "x86_64" },
			}),
		);
		expect(result.error).toBeUndefined();
		expect(result.cpu).toEqual({ count: 8, arch: "x86_64" });
		expect(result.memory).toEqual({
			totalBytes: 16_000_000_000,
			availableBytes: null,
		});
		expect(result.disk).toEqual({ totalBytes: null, availableBytes: null });
		expect(result.gpu).toEqual({ detection: "unavailable", devices: [] });
	});

	it("treats local nvidia-smi success as available, including zero rows", () => {
		const empty = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 4, memTotal: 1, arch: "aarch64" },
				gpuExit: 0,
				gpuCsv: "",
			}),
		);
		expect(empty.gpu).toEqual({ detection: "available", devices: [] });
		const one = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 4, memTotal: 1, arch: "aarch64" },
				gpuExit: 0,
				gpuCsv: t4,
			}),
		);
		expect(one.gpu.detection).toBe("available");
		expect(one.gpu.devices).toHaveLength(1);
		expect(one.gpu.devices[0]?.uuid).toBe("GPU-aaa");
	});

	it("does not treat nvidia-smi failure as zero GPUs", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 2, memTotal: 100, arch: "x86_64" },
				gpuExit: 127,
				gpuCsv: "",
			}),
		);
		expect(result.cpu.count).toBe(2);
		expect(result.gpu).toEqual({ detection: "unavailable", devices: [] });
	});

	it("ignores GPU stdout when the primary nvidia-smi exit is nonzero", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 8, memTotal: 100, arch: "x86_64" },
				gpuExit: 1,
				gpuCsv: t4,
			}),
		);
		expect(result.cpu.count).toBe(8);
		expect(result.gpu).toEqual({ detection: "unavailable", devices: [] });
	});

	it("ignores Engine JSON when docker info exit is nonzero", () => {
		const result = parseServerHardware(
			localEnvelope({
				engineExit: 1,
				engine: { ncpu: 8, memTotal: 16_000_000_000, arch: "x86_64" },
			}),
		);
		expect(result.cpu).toEqual({ count: null, arch: null });
		expect(result.memory.totalBytes).toBeNull();
	});

	it.each([0, -1, 1.5, "0", "-1", "foo", Number.NaN, Number.POSITIVE_INFINITY])(
		"does not report cpu.count=%s",
		(cpuCount) => {
			const local = parseServerHardware(
				localEnvelope({
					engine: { ncpu: cpuCount as number, memTotal: 100, arch: "x86_64" },
				}),
			);
			expect(local.cpu.count).toBeNull();
			const remote = parseServerHardware(
				remoteEnvelope({
					cpuCount: String(cpuCount),
					arch: "x86_64",
					memTotalKb: "4096",
				}),
			);
			expect(remote.cpu.count).toBeNull();
			expect(remote.memory.totalBytes).toBe(4096 * 1024);
		},
	);

	it("does not report zero or invalid memory and disk totals", () => {
		const localZero = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 8, memTotal: 0, arch: "x86_64" },
			}),
		);
		expect(localZero.cpu.count).toBe(8);
		expect(localZero.memory.totalBytes).toBeNull();

		const localNeg = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 8, memTotal: -1, arch: "x86_64" },
			}),
		);
		expect(localNeg.memory.totalBytes).toBeNull();

		const remote = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "0",
				memAvailKb: "0",
				cpuCount: "2",
				arch: "x86_64",
				diskTotalK: "0",
				diskAvailK: "0",
			}),
		);
		expect(remote.cpu.count).toBe(2);
		expect(remote.memory.totalBytes).toBeNull();
		expect(remote.memory.availableBytes).toBe(0);
		expect(remote.disk.totalBytes).toBeNull();
		expect(remote.disk.availableBytes).toBe(0);
	});

	it("does not leak raw probe envelope fields", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 2, memTotal: 100, arch: "x86_64" },
				gpuExit: 0,
				gpuCsv: t4,
			}),
		);
		expect(result).not.toHaveProperty("engineBase64");
		expect(result).not.toHaveProperty("gpuBase64");
		expect(result).not.toHaveProperty("capBase64");
		expect(JSON.stringify(result)).not.toContain("DockerRootDir");
	});

	it("keeps MemTotal when MemAvailable is malformed", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "4096",
				memAvailKb: "nope",
				cpuCount: "2",
				arch: "x86_64",
			}),
		);
		expect(result.memory.totalBytes).toBe(4096 * 1024);
		expect(result.memory.availableBytes).toBeNull();
		expect(result.cpu.count).toBe(2);
	});

	it("ignores disk stdout when df exits nonzero", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "4096",
				cpuCount: "4",
				arch: "x86_64",
				diskTotalK: "1000000",
				diskAvailK: "250000",
				diskExit: 1,
			}),
		);
		expect(result.cpu.count).toBe(4);
		expect(result.memory.totalBytes).toBe(4096 * 1024);
		expect(result.disk).toEqual({ totalBytes: null, availableBytes: null });
	});

	it("does not turn oversized memory values into Infinity", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "1e308",
				cpuCount: "2",
				arch: "x86_64",
			}),
		);
		expect(result.memory.totalBytes).toBeNull();
		expect(result.cpu.count).toBe(2);
	});

	it("keeps GPU inventory when compute_cap stdout is malformed", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 4, memTotal: 1, arch: "x86_64" },
				gpuExit: 0,
				gpuCsv: t4,
				capExit: 0,
				capCsv: "not-a-cap-row",
			}),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices).toHaveLength(1);
		expect(result.gpu.devices[0]?.computeCapability).toBeNull();
	});

	it("converts remote meminfo kB and df 1K-blocks to bytes", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "8000000",
				memAvailKb: "2000000",
				cpuCount: "16",
				arch: "x86_64",
				diskTotalK: "1000000",
				diskAvailK: "250000",
			}),
		);
		expect(result.memory).toEqual({
			totalBytes: 8000000 * 1024,
			availableBytes: 2000000 * 1024,
		});
		expect(result.disk).toEqual({
			totalBytes: 1000000 * 1024,
			availableBytes: 250000 * 1024,
		});
		expect(result.cpu).toEqual({ count: 16, arch: "x86_64" });
		expect(result.gpu.detection).toBe("unavailable");
	});

	it("parses heterogeneous GPUs and skips a malformed row", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "1",
				cpuCount: "8",
				arch: "x86_64",
				gpuExit: 0,
				gpuCsv: [t4, "bad-line", a100, commaName].join("\n"),
				capExit: 0,
				capCsv: [t4Cap, a100Cap, commaCap].join("\n"),
			}),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices.map((d) => d.name)).toEqual([
			"Tesla T4",
			"NVIDIA A100-SXM4-40GB",
			"NVIDIA Graphics Device, 16GB",
		]);
		expect(result.gpu.devices.map((d) => d.computeCapability)).toEqual([
			"7.5",
			"8.0",
			"8.9",
		]);
		expect(result.gpu.devices[1]?.memoryTotalMiB).toBe(40960);
		expect(result.gpu.devices[1]?.memoryFreeMiB).toBe(20000);
		expect(result.cpu.count).toBe(8);
	});

	it("merges compute capability by GPU index, not row order", () => {
		const gpu3 = "3, GPU-ddd, NVIDIA RTX 4090, 24576, 24000, 575.57.08";
		const result = parseServerHardware(
			remoteEnvelope({
				cpuCount: "8",
				arch: "x86_64",
				gpuExit: 0,
				gpuCsv: [t4, gpu3].join("\n"),
				capExit: 0,
				capCsv: ["3, 8.9", "0, 7.5"].join("\n"),
			}),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices).toEqual([
			expect.objectContaining({
				index: 0,
				uuid: "GPU-aaa",
				computeCapability: "7.5",
			}),
			expect.objectContaining({
				index: 3,
				uuid: "GPU-ddd",
				name: "NVIDIA RTX 4090",
				computeCapability: "8.9",
			}),
		]);
	});

	it("keeps inventory when compute_cap is unsupported", () => {
		const result = parseServerHardware(
			localEnvelope({
				engine: { ncpu: 4, memTotal: 1, arch: "x86_64" },
				gpuExit: 0,
				gpuCsv: [t4, a100].join("\n"),
				capExit: 1,
				capCsv: "",
			}),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices).toHaveLength(2);
		expect(result.gpu.devices[0]?.name).toBe("Tesla T4");
		expect(result.gpu.devices.every((d) => d.computeCapability === null)).toBe(
			true,
		);
	});

	it("keeps CPU and memory when GPU detection fails", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "4096",
				memAvailKb: "1024",
				cpuCount: "4",
				arch: "aarch64",
				diskTotalK: "10",
				diskAvailK: "5",
				gpuExit: 1,
			}),
		);
		expect(result.cpu.count).toBe(4);
		expect(result.memory.totalBytes).toBe(4096 * 1024);
		expect(result.disk.totalBytes).toBe(10 * 1024);
		expect(result.gpu).toEqual({ detection: "unavailable", devices: [] });
		expect(result.error).toBeUndefined();
	});

	it("keeps CPU and memory when disk fields are missing", () => {
		const result = parseServerHardware(
			remoteEnvelope({
				memTotalKb: "2048",
				cpuCount: "2",
				arch: "x86_64",
			}),
		);
		expect(result.cpu.count).toBe(2);
		expect(result.memory.totalBytes).toBe(2048 * 1024);
		expect(result.memory.availableBytes).toBeNull();
		expect(result.disk).toEqual({ totalBytes: null, availableBytes: null });
	});

	it("returns error for a malformed envelope", () => {
		const result = parseServerHardware("not-json");
		expect(result.error).toBe("Could not parse server hardware output");
		expect(result.cpu.count).toBeNull();
	});
});

describe("hardware probe scripts", () => {
	it("reads local Engine JSON and treats missing nvidia-smi as unavailable", () => {
		const sandbox = makeSandbox({
			docker: `#!/bin/sh
printf '%s\\n' '{"ncpu":8,"memTotal":16000000000,"arch":"x86_64"}'
exit 0
`,
		});
		const result = parseServerHardware(
			runScript(buildLocalHardwareScript(), sandbox),
		);
		expect(result.cpu).toEqual({ count: 8, arch: "x86_64" });
		expect(result.memory.availableBytes).toBeNull();
		expect(result.disk.totalBytes).toBeNull();
		expect(result.gpu.detection).toBe("unavailable");
		expect(result.gpu.devices).toEqual([]);
	});

	it("parses local nvidia-smi when the binary is present", () => {
		const sandbox = makeSandbox({
			docker: `#!/bin/sh
printf '%s\\n' '{"ncpu":4,"memTotal":1,"arch":"aarch64"}'
exit 0
`,
			"nvidia-smi": `#!/bin/sh
case "$*" in
*compute_cap*)
	printf '%s\\n' '${t4Cap}'
	exit 0
	;;
esac
printf '%s\\n' '${t4}'
exit 0
`,
		});
		const result = parseServerHardware(
			runScript(buildLocalHardwareScript(), sandbox),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices[0]?.name).toBe("Tesla T4");
		expect(result.gpu.devices[0]?.computeCapability).toBe("7.5");
	});

	it("keeps local inventory when compute_cap query fails", () => {
		const sandbox = makeSandbox({
			docker: `#!/bin/sh
printf '%s\\n' '{"ncpu":4,"memTotal":1,"arch":"aarch64"}'
exit 0
`,
			"nvidia-smi": `#!/bin/sh
case "$*" in
*compute_cap*)
	exit 1
	;;
esac
printf '%s\\n' '${t4}'
exit 0
`,
		});
		const result = parseServerHardware(
			runScript(buildLocalHardwareScript(), sandbox),
		);
		expect(result.gpu.detection).toBe("available");
		expect(result.gpu.devices).toHaveLength(1);
		expect(result.gpu.devices[0]?.name).toBe("Tesla T4");
		expect(result.gpu.devices[0]?.computeCapability).toBeNull();
	});

	it("ignores docker info stdout when the command exits nonzero", () => {
		const sandbox = makeSandbox({
			docker: `#!/bin/sh
printf '%s\\n' '{"ncpu":8,"memTotal":16000000000,"arch":"x86_64"}'
exit 1
`,
		});
		const result = parseServerHardware(
			runScript(buildLocalHardwareScript(), sandbox),
		);
		expect(result.cpu).toEqual({ count: null, arch: null });
		expect(result.memory.totalBytes).toBeNull();
	});

	it("ignores nvidia-smi stdout when the inventory command exits nonzero", () => {
		const sandbox = makeSandbox({
			docker: `#!/bin/sh
printf '%s\\n' '{"ncpu":4,"memTotal":1,"arch":"x86_64"}'
exit 0
`,
			"nvidia-smi": `#!/bin/sh
printf '%s\\n' '${t4}'
exit 1
`,
		});
		const result = parseServerHardware(
			runScript(buildLocalHardwareScript(), sandbox),
		);
		expect(result.cpu.count).toBe(4);
		expect(result.gpu).toEqual({ detection: "unavailable", devices: [] });
	});

	it("reads remote host facts through the generated script", () => {
		const sandbox = makeSandbox({
			awk: `#!/bin/sh
case "$*" in
*MemTotal*)
	printf '%s\\n' '8000000'
	exit 0
	;;
*MemAvailable*)
	printf '%s\\n' '2000000'
	exit 0
	;;
esac
exec ${resolveBin("awk")} "$@"
`,
			nproc: `#!/bin/sh
printf '%s\\n' '16'
exit 0
`,
			uname: `#!/bin/sh
printf '%s\\n' 'x86_64'
exit 0
`,
			df: `#!/bin/sh
case " $* " in
*" -Pk "*) ;;
*)
	printf '%s\\n' 'df: expected -Pk' >&2
	exit 2
	;;
esac
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' '/dev/sda1 1000000 750000 250000 75% /'
exit 0
`,
		});
		const result = parseServerHardware(
			runScript(buildRemoteHardwareScript(), sandbox),
		);
		expect(result.cpu).toEqual({ count: 16, arch: "x86_64" });
		expect(result.memory).toEqual({
			totalBytes: 8000000 * 1024,
			availableBytes: 2000000 * 1024,
		});
		expect(result.disk).toEqual({
			totalBytes: 1000000 * 1024,
			availableBytes: 250000 * 1024,
		});
		expect(result.gpu.detection).toBe("unavailable");
	});

	it("keeps remote CPU and memory when df prints a table then exits 1", () => {
		const sandbox = makeSandbox({
			awk: `#!/bin/sh
case "$*" in
*MemTotal*)
	printf '%s\\n' '4096'
	exit 0
	;;
*MemAvailable*)
	printf '%s\\n' '1024'
	exit 0
	;;
esac
exec ${resolveBin("awk")} "$@"
`,
			nproc: `#!/bin/sh
printf '%s\\n' '4'
exit 0
`,
			uname: `#!/bin/sh
printf '%s\\n' 'aarch64'
exit 0
`,
			df: `#!/bin/sh
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' '/dev/sda1 1000000 750000 250000 75% /'
exit 1
`,
		});
		const result = parseServerHardware(
			runScript(buildRemoteHardwareScript(), sandbox),
		);
		expect(result.cpu).toEqual({ count: 4, arch: "aarch64" });
		expect(result.memory.totalBytes).toBe(4096 * 1024);
		expect(result.disk).toEqual({ totalBytes: null, availableBytes: null });
	});

	it("falls back to cpuinfo when nproc is missing", () => {
		const sandbox = makeSandbox({
			awk: `#!/bin/sh
case "$*" in
*MemTotal*)
	printf '%s\\n' '2048'
	exit 0
	;;
esac
exec ${resolveBin("awk")} "$@"
`,
			grep: `#!/bin/sh
case "$*" in
*processor*)
	printf '%s\\n' '8'
	exit 0
	;;
esac
exit 1
`,
			uname: `#!/bin/sh
printf '%s\\n' 'x86_64'
exit 0
`,
			df: `#!/bin/sh
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' '/dev/sda1 10 5 5 50% /'
exit 0
`,
		});
		const result = parseServerHardware(
			runScript(buildRemoteHardwareScript(), sandbox),
		);
		expect(result.cpu.count).toBe(8);
		expect(result.memory.totalBytes).toBe(2048 * 1024);
	});
});

describe("getServerHardware", () => {
	beforeEach(() => {
		cloud.enabled = false;
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsyncRemote).mockReset();
	});

	it("uses execAsync for the local path and never execAsyncRemote", async () => {
		vi.mocked(execAsync).mockResolvedValue({
			stdout: localEnvelope({
				engine: { ncpu: 8, memTotal: 100, arch: "x86_64" },
			}),
			stderr: "",
		});
		const result = await getServerHardware();
		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker info --format"),
		);
		expect(execAsyncRemote).not.toHaveBeenCalled();
		expect(result.cpu.count).toBe(8);
		expect(result.memory.availableBytes).toBeNull();
	});

	it("uses execAsyncRemote for a remote serverId and never execAsync", async () => {
		vi.mocked(execAsyncRemote).mockResolvedValue({
			stdout: remoteEnvelope({
				memTotalKb: "1000",
				cpuCount: "2",
				arch: "x86_64",
				gpuExit: 0,
				gpuCsv: t4,
			}),
			stderr: "",
		});
		const result = await getServerHardware("remote-server");
		expect(execAsyncRemote).toHaveBeenCalledWith(
			"remote-server",
			expect.stringContaining("/proc/meminfo"),
		);
		expect(execAsync).not.toHaveBeenCalled();
		expect(result.gpu.devices[0]?.uuid).toBe("GPU-aaa");
	});

	it("rejects a local probe on cloud without executing commands", async () => {
		cloud.enabled = true;
		await expect(getServerHardware()).rejects.toMatchObject({
			name: "TRPCError",
			code: "BAD_REQUEST",
			message: "Server is required",
		});
		expect(execAsync).not.toHaveBeenCalled();
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("returns empty hardware plus error when SSH fails", async () => {
		vi.mocked(execAsyncRemote).mockRejectedValue(new Error("SSH failed"));
		const result = await getServerHardware("remote-server");
		expect(result.error).toBe("SSH failed");
		expect(result.cpu.count).toBeNull();
		expect(result.gpu.detection).toBe("unavailable");
		expect(execAsync).not.toHaveBeenCalled();
	});
});
