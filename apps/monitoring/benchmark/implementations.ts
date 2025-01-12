import { createReadStream, statSync } from "node:fs";
import fs from "node:fs/promises";
import readline from "node:readline";
import { parseLog, processMetrics } from "../src/utils.js";

// Implementation 1: Read entire file at once
export async function currentImplementation(filePath: string, limit?: number) {
	const content = await fs.readFile(filePath, "utf8");
	const metrics = parseLog(content);
	return processMetrics(metrics, { limit });
}

// Implementation 2: Read line by line using readline
export async function readlineImplementation(filePath: string, limit?: number) {
	const fileStream = createReadStream(filePath);
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	const metrics = [];
	for await (const line of rl) {
		try {
			metrics.push(JSON.parse(line));
		} catch {
			metrics.push({ raw: line });
		}
	}

	return processMetrics(metrics, { limit });
}

// Implementation 3: Optimized tail reading for limited queries
export async function tailImplementation(
	filePath: string,
	limit?: number | null,
) {
	if (!limit) {
		return currentImplementation(filePath);
	}

	// Get file size
	const { size } = statSync(filePath);

	// Buffer for storing last bytes
	const chunkSize = Math.min(size, limit * 200); // Estimate 200 bytes per line
	const buffer = Buffer.alloc(chunkSize);

	// Open file for reading
	const fd = await fs.open(filePath, "r");

	try {
		// Read last bytes of the file
		await fd.read(buffer, 0, chunkSize, size - chunkSize);

		// Convert to string and split into lines
		const content = buffer.toString("utf8");
		const lines = content.split("\n").filter((line) => line.trim());

		// Take only the last 'limit' lines
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

// Implementation 4: In-memory cache with TTL
const metricsCache = new Map<string, any[]>();
let lastCacheUpdate = 0;
const CACHE_TTL = 5000; // 5 seconds TTL

export async function cachedImplementation(filePath: string, limit?: number) {
	const now = Date.now();

	// Use cache if valid
	if (metricsCache.has(filePath) && now - lastCacheUpdate < CACHE_TTL) {
		const metrics = metricsCache.get(filePath)!;
		return processMetrics(metrics, { limit });
	}

	// If no cache or expired, read file
	const content = await fs.readFile(filePath, "utf8");
	const metrics = parseLog(content);

	// Update cache
	metricsCache.set(filePath, metrics);
	lastCacheUpdate = now;

	return processMetrics(metrics, { limit });
}
