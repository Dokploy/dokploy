import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { IS_CLOUD } from "../constants";
import { buildHardwareScripts } from "./server-hardware-scripts";

// Matches remoteStream SSH readyTimeout. Hardware commands are fast; this
// bounds stalled docker/nvidia-smi/SSH so the API cannot wait forever.
export const HARDWARE_PROBE_TIMEOUT_MS = 30_000;

// Same wording as the model-runner probe so callers can match one string.
export const ENGINE_INFO_ERROR = "Could not read Docker Engine info";

export type GpuUnavailableReason =
	| "nvidia-smi-not-found"
	| "probe-failed"
	| "invalid-output";

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
	readonly architecture: string | null;
	gpu: {
		detection: "available" | "unavailable";
		/**
		 * Locally, nvidia-smi is only present when the Dokploy container itself
		 * has GPU access (NVIDIA runtime with NVIDIA_VISIBLE_DEVICES, or --gpus);
		 * "nvidia-smi-not-found" tells the UI which of the two to suggest.
		 */
		unavailableReason?: GpuUnavailableReason;
		devices: ServerHardwareGpu[];
	};
	error?: string;
}

const envelopeSchema = z.object({
	kind: z.unknown().optional(),
	engineExit: z.unknown().optional(),
	engineBase64: z.unknown().optional(),
	gpuExit: z.unknown().optional(),
	gpuBase64: z.unknown().optional(),
	capExit: z.unknown().optional(),
	capBase64: z.unknown().optional(),
	arch: z.unknown().optional(),
});

const engineSchema = z.object({ arch: z.unknown().optional() });

const emptyHardware = (error?: unknown): ServerHardware => ({
	checkedAt: new Date().toISOString(),
	architecture: null,
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

const b64Decode = (value: unknown): string => {
	if (typeof value !== "string") return "";
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
		return {
			detection: "unavailable",
			unavailableReason:
				gpuExit === 127 ? "nvidia-smi-not-found" : "probe-failed",
			devices: [],
		};
	}
	const devices = parseNvidiaGpuCsv(gpuCsv);
	if (gpuCsv.trim() && devices.length === 0) {
		return {
			detection: "unavailable",
			unavailableReason: "invalid-output",
			devices: [],
		};
	}
	return {
		detection: "available",
		devices:
			capExit === 0 ? mergeComputeCapabilities(devices, capCsv) : devices,
	};
};

export const parseServerHardware = (stdout: string): ServerHardware => {
	const decoded = envelopeSchema.safeParse(parseJson(stdout.trim()));
	if (!decoded.success) return emptyHardware(new Error(PARSE_ERROR));
	const envelope = decoded.data;

	const gpu = gpuFromProbe(
		parseExitCode(envelope.gpuExit, 1),
		b64Decode(envelope.gpuBase64),
		parseExitCode(envelope.capExit, 1),
		b64Decode(envelope.capBase64),
	);

	if (envelope.kind === "local") {
		const engineExit = parseExitCode(envelope.engineExit, 1);
		const engineJson =
			engineExit === 0
				? parseJson(b64Decode(envelope.engineBase64).trim())
				: null;
		const decodedEngine = engineSchema.safeParse(engineJson);
		const engine = decodedEngine.success ? decodedEngine.data : null;

		return {
			checkedAt: new Date().toISOString(),
			architecture: nullIfEmpty(engine?.arch),
			gpu,
			...(engine ? {} : { error: ENGINE_INFO_ERROR }),
		};
	}

	return {
		checkedAt: new Date().toISOString(),
		architecture: nullIfEmpty(envelope.arch),
		gpu,
	};
};

const PARSE_ERROR = "Could not parse server hardware output";

// Executor messages can embed the probe script or its raw output; the API
// only relays stable, script-free descriptions.
const probeErrorMessage = (reason: unknown): string => {
	if (reason instanceof ExecError) {
		if (reason.message.includes("timed out"))
			return `Hardware probe timed out after ${HARDWARE_PROBE_TIMEOUT_MS}ms`;
		if (reason.exitCode != null)
			return `Hardware probe exited with code ${reason.exitCode}`;
		if (reason.message.includes(reason.command))
			return "Hardware probe could not be executed";
		return reason.message;
	}
	if (reason instanceof Error && reason.message) return reason.message;
	return "Could not read server hardware";
};

const probeServerHardware = async (
	serverId?: string,
): Promise<ServerHardware> => {
	const results = await Promise.allSettled(
		buildHardwareScripts(Boolean(serverId)).map(async (script) => {
			const result = serverId
				? await execAsyncRemote(serverId, script, undefined, {
						timeout: HARDWARE_PROBE_TIMEOUT_MS,
					})
				: await execAsync(script, { timeout: HARDWARE_PROBE_TIMEOUT_MS });
			const parsed = parseJson(result.stdout);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				throw new Error(PARSE_ERROR);
			}
			return parsed;
		}),
	);
	const fields = {};
	const errors: string[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") Object.assign(fields, result.value);
		else errors.push(probeErrorMessage(result.reason));
	}
	const parsed = parseServerHardware(
		JSON.stringify({ ...fields, kind: serverId ? "remote" : "local" }),
	);
	const messages = [
		...new Set([...(parsed.error ? [parsed.error] : []), ...errors]),
	];
	return {
		...parsed,
		...(messages.length ? { error: messages.join("; ") } : {}),
	};
};

// A remote probe opens one SSH session per script; concurrent requests for the
// same host multiply that and trip sshd MaxStartups. Requests share the probe
// already in flight instead of caching, so completed results are never reused.
const inflight = new Map<string, Promise<ServerHardware>>();

export const getServerHardware = async (
	serverId?: string,
): Promise<ServerHardware> => {
	if (IS_CLOUD && !serverId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Server is required",
		});
	}

	const key = serverId ? `server:${serverId}` : "local";
	const pending = inflight.get(key);
	if (pending) return pending;
	const probe = probeServerHardware(serverId).finally(() => {
		if (inflight.get(key) === probe) inflight.delete(key);
	});
	inflight.set(key, probe);
	return probe;
};
