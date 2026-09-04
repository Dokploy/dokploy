import { stripVTControlCharacters } from "node:util";
import { z } from "zod";

export const analysisTargetSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("deployment"), deploymentId: z.string().min(1) }),
	z.object({
		type: z.literal("runtime"),
		containerId: z
			.string()
			.min(1)
			.max(255)
			.regex(/^[a-zA-Z0-9_.-]+$/),
		runType: z.enum(["swarm", "native"]),
		serverId: z.string().min(1).optional(),
		serviceId: z.string().min(1).optional(),
	}),
]);

export type AnalysisTarget = z.infer<typeof analysisTargetSchema>;
export const analyzeLogsSchema = z
	.object({
		aiId: z.string().min(1),
		context: z.enum(["build", "runtime"]),
		logs: z
			.string()
			.max(2 * 1024 * 1024)
			.optional(),
		target: analysisTargetSchema.optional(),
	})
	.refine(
		(input) => input.target || input.logs?.trim(),
		"Logs or a target are required",
	);

export const MAX_LOG_BYTES = 1024 * 1024;

export function selectLogWindow(raw: string, limit: number) {
	const buffer = Buffer.from(raw);
	const truncated = buffer.length > MAX_LOG_BYTES;
	const text = stripVTControlCharacters(
		(truncated ? buffer.subarray(-MAX_LOG_BYTES) : buffer).toString("utf8"),
	);
	const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
	const selected = lines.slice(-limit);
	const logs = selected.join("\n");
	return { logs, lineCount: logs.trim() ? selected.length : 0, truncated };
}
