import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
	currentImplementation,
	readlineImplementation,
	tailImplementation,
	cachedImplementation,
} from "./implementations.js";
import { processMetricsFromFile } from "../src/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = path.join(__dirname, "test-metrics.log");
const ITERATIONS = 5;

// Get base timestamp (30 seconds ago)
const currentTime = new Date();
const baseTime = new Date(currentTime.getTime() - 30000);

interface Scenario {
	name: string;
	options: {
		start?: string;
		end?: string;
		limit?: number;
	};
}

const scenarios: Scenario[] = [
	{
		name: "Last 10 lines (most common case)",
		options: { limit: 10 },
	},
	{
		name: "Last 100 lines",
		options: { limit: 100 },
	},
	{
		name: "Last 1000 lines",
		options: { limit: 1000 },
	},
	{
		name: "Last 10000 lines",
		options: { limit: 10000 },
	},
	{
		name: "Full file",
		options: {},
	},
	{
		name: "Date filter (last 15 seconds)",
		options: {
			start: new Date(baseTime.getTime() + 15000).toISOString(),
			end: currentTime.toISOString(),
		},
	},
	{
		name: "Date filter with limit",
		options: {
			start: baseTime.toISOString(),
			end: currentTime.toISOString(),
			limit: 100,
		},
	},
];

interface Implementation {
	name: string;
	fn: (
		filePath: string,
		options?: { limit?: number; start?: string; end?: string },
	) => Promise<any[]>;
}

const implementations: Implementation[] = [
	{
		name: "Current Implementation",
		fn: (filePath, options) => currentImplementation(filePath, options?.limit),
	},
	{
		name: "Readline Implementation",
		fn: (filePath, options) => readlineImplementation(filePath, options?.limit),
	},
	{
		name: "Tail Implementation",
		fn: (filePath, options) => tailImplementation(filePath, options?.limit),
	},
	{
		name: "Cached Implementation",
		fn: (filePath, options) => cachedImplementation(filePath, options?.limit),
	},
	{
		name: "New Implementation",
		fn: (filePath, options) =>
			processMetricsFromFile(filePath, {
				limit: options?.limit,
			}),
	},
];

async function runBenchmark() {
	console.log("Running benchmark comparison...\n");

	for (const scenario of scenarios) {
		console.log(`\nScenario: ${scenario.name}`);
		console.log("=".repeat(50));

		for (const impl of implementations) {
			let totalTime = 0;
			const results = [];

			for (let i = 0; i < ITERATIONS; i++) {
				const start = performance.now();
				const result = await impl.fn(TEST_FILE, scenario.options);
				const time = performance.now() - start;
				totalTime += time;
				results.push(result);
			}

			console.log(
				`${impl.name.padEnd(25)}: ${(totalTime / ITERATIONS).toFixed(2)}ms`,
				`(${results[0].length} items)`,
			);
		}
	}
}

// Run benchmark
runBenchmark();
