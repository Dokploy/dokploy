import { statSync } from "node:fs";
import fs from "node:fs/promises";

// Cache configuration for metrics
const metricsCache = new Map<string, any[]>();
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5 seconds TTL

/**
 * Parse a log file content into an array of metric objects
 * @param logContent The raw log content
 * @returns Array of parsed metric objects
 */
export function parseLog(logContent: string) {
	if (!logContent.trim()) return [];

	const lines = logContent.trim().split("\n");
	return lines.map((line) => {
		try {
			return JSON.parse(line);
		} catch {
			return { raw: line };
		}
	});
}

/**
 * Filter metrics by timestamp range
 * @param metrics Array of metric objects
 * @param start Optional start timestamp
 * @param end Optional end timestamp
 * @returns Filtered and sorted metrics
 */
export function filterByTimestamp(
	metrics: any[],
	start?: string,
	end?: string,
) {
	// If no filters, return all sorted by timestamp
	if (!start && !end) {
		return metrics.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	// Convert to timestamps (if they exist)
	const startTime = start ? new Date(start).getTime() : null;
	const endTime = end ? new Date(end).getTime() : null;

	return metrics
		.filter((metric) => {
			const metricTime = new Date(metric.timestamp).getTime();

			if (startTime && endTime) {
				return metricTime >= startTime && metricTime <= endTime;
			}
			if (startTime) {
				return metricTime >= startTime;
			}
			if (endTime) {
				return metricTime <= endTime;
			}
			return true;
		})
		.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
}

/**
 * Read only the last N lines from a file efficiently
 * @param filePath Path to the file
 * @param limit Number of lines to read
 * @returns Array of parsed metric objects
 */
async function readLastNLines(filePath: string, limit: number) {
	const { size } = statSync(filePath);
	const chunkSize = Math.min(size, limit * 200); // Estimate 200 bytes per line
	const buffer = new Uint8Array(chunkSize);

	const fd = await fs.open(filePath, "r");
	try {
		await fd.read({
			buffer,
			length: chunkSize,
			position: size - chunkSize,
			offset: 0
		});
		const content = Buffer.from(buffer).toString("utf8");
		const lines = content.split("\n").filter((line) => line.trim());
		const lastLines = lines.slice(-limit);

		return lastLines.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return { raw: line };
			}
		});
	} finally {
		await fd.close();
	}
}

/**
 * Process metrics from a file with optimized strategies:
 * - For limit-only queries: Read only required bytes from end of file
 * - For full file or date filters: Use in-memory cache with TTL
 *
 * @param filePath Path to the metrics file
 * @param options Query options (limit, start date, end date)
 * @returns Processed metrics based on the options
 */
export async function processMetricsFromFile(
	filePath: string,
	options: {
		start?: string;
		end?: string;
		limit?: number;
	},
) {
	const { start, end, limit } = options;

	// For limit-only queries, use optimized tail reading
	if (limit && limit > 0 && !start && !end) {
		return readLastNLines(filePath, limit);
	}

	// For full file or date filters, use cache
	const now = Date.now();
	if (metricsCache.has(filePath) && now - lastCacheUpdate < CACHE_TTL) {
		const metrics = metricsCache.get(filePath)!;
		return processMetrics(metrics, options);
	}

	const content = await fs.readFile(filePath, "utf8");
	const metrics = parseLog(content);
	metricsCache.set(filePath, metrics);
	lastCacheUpdate = now;

	return processMetrics(metrics, options);
}

/**
 * Process an array of metrics with filtering and limiting
 * @param metrics Array of metric objects
 * @param options Processing options (limit, start date, end date)
 * @returns Processed metrics based on the options
 */
export function processMetrics(
	metrics: any[],
	options: {
		start?: string;
		end?: string;
		limit?: number;
	},
) {
	const { start, end, limit } = options;

	// First filter by timestamp
	const filteredMetrics = filterByTimestamp(metrics, start, end);

	// If limit is 0, return empty array
	if (limit === 0) return [];

	// If there's a limit > 0, apply it
	return limit && limit > 0 ? filteredMetrics.slice(-limit) : filteredMetrics;
}
