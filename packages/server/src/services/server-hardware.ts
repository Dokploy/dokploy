import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { IS_CLOUD } from "../constants";
import { buildHardwareScripts } from "./server-hardware-scripts";

// Matches remoteStream SSH readyTimeout. Hardware commands are fast; this
// bounds stalled docker/nvidia-smi/df/SSH so the API cannot wait forever.
export const HARDWARE_PROBE_TIMEOUT_MS = 30_000;

export interface ServerHardwareGpu {
	index: number;
	uuid: string | null;
	name: string;
	vendor: "nvidia";
	computeCapability: string | null;
	memoryTotalMiB: number | null;
	memoryFreeMiB: number | null;
	driverVersion: string | null;
}

export interface ServerHardware {
	checkedAt: string;
	cpu: {
		count: number | null;
		arch: string | null;
	};
	memory: {
		totalBytes: number | null;
		availableBytes: number | null;
	};
	/**
	 * Remote values come from `df -Pk /` on the SSH host (root filesystem,
	 * 1024-byte blocks). That is not Docker/model storage capacity. Local
	 * values are always null.
	 */
	disk: {
		totalBytes: number | null;
		availableBytes: number | null;
	};
	gpu: {
		detection: "available" | "unavailable";
		devices: ServerHardwareGpu[];
	};
	error?: string;
}

interface HardwareEnvelope {
	kind?: string;
	engineExit?: number;
	engineBase64?: string;
	gpuExit?: number;
	gpuBase64?: string;
	capExit?: number;
	capBase64?: string;
	memTotalKb?: string;
	memAvailKb?: string;
	cpuCount?: string;
	arch?: string;
	diskTotalK?: string;
	diskAvailK?: string;
	diskExit?: number;
}

interface EngineInfo {
	ncpu?: number | null;
	memTotal?: number | null;
	arch?: string | null;
}

const emptyHardware = (error?: unknown): ServerHardware => ({
	checkedAt: new Date().toISOString(),
	cpu: { count: null, arch: null },
	memory: { totalBytes: null, availableBytes: null },
	disk: { totalBytes: null, availableBytes: null },
	gpu: { detection: "unavailable", devices: [] },
	...(error !== undefined
		? {
				error:
					error instanceof Error
						? error.message
						: typeof error === "string"
							? error
							: "Could not read server hardware",
			}
		: {}),
});

const nullIfEmpty = (value: unknown): string | null => {
	const trimmed = typeof value === "string" ? value.trim() : "";
	return trimmed ? trimmed : null;
};

const parseFinite = (value: string | null | undefined): number | null => {
	if (value == null || value.trim() === "") return null;
	const n = Number(value.trim());
	return Number.isFinite(n) ? n : null;
};

const parseNonNegativeFinite = (
	value: string | null | undefined,
): number | null => {
	const n = parseFinite(value);
	return n != null && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
};

const parseNonNegativeInt = (
	value: string | null | undefined,
): number | null => {
	const trimmed = value?.trim() ?? "";
	if (!/^\d+$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER
		? n
		: null;
};

const parsePositiveInt = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isInteger(value) &&
			value > 0 &&
			value <= Number.MAX_SAFE_INTEGER
			? value
			: null;
	}
	const n = parseNonNegativeInt(String(value ?? ""));
	return n != null && n > 0 ? n : null;
};

const parseExitCode = (value: unknown, whenMissing: number): number => {
	if (value === 0 || value === "0") return 0;
	if (typeof value === "number") {
		return Number.isInteger(value) && value >= 0 ? value : whenMissing;
	}
	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		return Number(value.trim());
	}
	return whenMissing;
};

const kbToBytes = (kb: string | null | undefined): number | null => {
	const n = parseNonNegativeFinite(kb);
	if (n == null) return null;
	const bytes = Math.round(n * 1024);
	return Number.isSafeInteger(bytes) ? bytes : null;
};

const positiveBytes = (value: number | null): number | null =>
	value != null && value > 0 && Number.isSafeInteger(value) ? value : null;

const engineMemTotalBytes = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return positiveBytes(Math.round(value));
};

const b64Decode = (value?: string): string => {
	if (!value) return "";
	try {
		return Buffer.from(value, "base64").toString("utf-8");
	} catch {
		return "";
	}
};

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

/**
 * Primary inventory csv,noheader,nounits:
 * index, uuid, name (may contain commas), memory.total, memory.free, driver_version
 */
export const parseNvidiaGpuLine = (line: string): ServerHardwareGpu | null => {
	const parts = line.split(",").map((part) => part.trim());
	if (parts.length < 6) return null;
	const index = parseNonNegativeInt(parts[0]);
	if (index == null) return null;
	const uuid = nullIfEmpty(parts[1]);
	const driverVersion = nullIfEmpty(parts[parts.length - 1]);
	const memoryFreeMiB = parseNonNegativeFinite(parts[parts.length - 2]);
	const memoryTotal = parseNonNegativeFinite(parts[parts.length - 3]);
	const name = parts
		.slice(2, parts.length - 3)
		.join(", ")
		.trim();
	if (!name) return null;
	return {
		index,
		uuid,
		name,
		vendor: "nvidia",
		computeCapability: null,
		memoryTotalMiB: memoryTotal != null && memoryTotal > 0 ? memoryTotal : null,
		memoryFreeMiB,
		driverVersion,
	};
};

export const parseComputeCapLine = (
	line: string,
): { index: number; computeCapability: string } | null => {
	const parts = line.split(",").map((part) => part.trim());
	if (parts.length < 2) return null;
	const index = parseNonNegativeInt(parts[0]);
	const computeCapability = nullIfEmpty(parts.slice(1).join(","));
	if (
		index == null ||
		!computeCapability ||
		!/^\d+\.\d+$/.test(computeCapability)
	)
		return null;
	return { index, computeCapability };
};

const csvLines = (csv: string) =>
	csv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

export const parseNvidiaGpuCsv = (csv: string): ServerHardwareGpu[] =>
	csvLines(csv)
		.map(parseNvidiaGpuLine)
		.filter((row): row is ServerHardwareGpu => row !== null);

export const mergeComputeCapabilities = (
	devices: ServerHardwareGpu[],
	capCsv: string,
): ServerHardwareGpu[] => {
	const caps = new Map<number, string>();
	for (const line of csvLines(capCsv)) {
		const parsed = parseComputeCapLine(line);
		if (parsed) caps.set(parsed.index, parsed.computeCapability);
	}
	return devices.map((device) => ({
		...device,
		computeCapability: caps.get(device.index) ?? null,
	}));
};

const gpuFromProbe = (
	gpuExit: number,
	gpuCsv: string,
	capExit: number,
	capCsv: string,
): ServerHardware["gpu"] => {
	if (gpuExit !== 0) {
		return { detection: "unavailable", devices: [] };
	}
	const devices = parseNvidiaGpuCsv(gpuCsv);
	return {
		detection:
			gpuCsv.trim() && devices.length === 0 ? "unavailable" : "available",
		devices:
			capExit === 0 ? mergeComputeCapabilities(devices, capCsv) : devices,
	};
};

export const parseServerHardware = (stdout: string): ServerHardware => {
	let envelope: HardwareEnvelope;
	try {
		envelope = JSON.parse(stdout.trim());
	} catch {
		return emptyHardware(new Error("Could not parse server hardware output"));
	}

	const gpu = gpuFromProbe(
		parseExitCode(envelope.gpuExit, 1),
		b64Decode(envelope.gpuBase64),
		parseExitCode(envelope.capExit, 1),
		b64Decode(envelope.capBase64),
	);

	if (envelope.kind === "local") {
		const engineExit = parseExitCode(envelope.engineExit, 1);
		const engine =
			engineExit === 0
				? (parseJson(
						b64Decode(envelope.engineBase64).trim(),
					) as EngineInfo | null)
				: null;
		return {
			checkedAt: new Date().toISOString(),
			cpu: {
				count: parsePositiveInt(engine?.ncpu),
				arch: nullIfEmpty(engine?.arch ?? undefined),
			},
			memory: {
				totalBytes: engineMemTotalBytes(engine?.memTotal),
				availableBytes: null,
			},
			disk: { totalBytes: null, availableBytes: null },
			gpu,
		};
	}

	const diskExit = parseExitCode(envelope.diskExit, 0);
	return {
		checkedAt: new Date().toISOString(),
		cpu: {
			count: parsePositiveInt(envelope.cpuCount),
			arch: nullIfEmpty(envelope.arch),
		},
		memory: {
			totalBytes: positiveBytes(kbToBytes(envelope.memTotalKb)),
			availableBytes: kbToBytes(envelope.memAvailKb),
		},
		disk:
			diskExit === 0
				? {
						totalBytes: positiveBytes(kbToBytes(envelope.diskTotalK)),
						availableBytes: kbToBytes(envelope.diskAvailK),
					}
				: { totalBytes: null, availableBytes: null },
		gpu,
	};
};

export const getServerHardware = async (
	serverId?: string,
): Promise<ServerHardware> => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const results = await Promise.allSettled(
		buildHardwareScripts(Boolean(serverId)).map(async (script) => {
			const result = serverId
				? await execAsyncRemote(serverId, script, undefined, {
						timeout: HARDWARE_PROBE_TIMEOUT_MS,
					})
				: await execAsync(script, { timeout: HARDWARE_PROBE_TIMEOUT_MS });
			const parsed: unknown = JSON.parse(result.stdout);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				throw new Error("Could not parse server hardware output");
			}
			return parsed;
		}),
	);
	const fields = {};
	const errors: string[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") Object.assign(fields, result.value);
		else
			errors.push(
				result.reason instanceof Error
					? result.reason.message
					: "Could not read server hardware",
			);
	}
	return {
		...parseServerHardware(
			JSON.stringify({ ...fields, kind: serverId ? "remote" : "local" }),
		),
		...(errors.length ? { error: [...new Set(errors)].join("; ") } : {}),
	};
};
