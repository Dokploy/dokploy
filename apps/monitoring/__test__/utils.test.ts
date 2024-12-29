import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	parseLog,
	filterByTimestamp,
	processMetrics,
	processMetricsFromFile,
} from "../src/utils.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_LOG_FILE = path.join(__dirname, "test-metrics.log");

describe("parseLog", () => {
	it("should parse valid JSON log lines", () => {
		const logContent = `{"timestamp": "2024-12-28T00:00:00Z", "value": 1}
{"timestamp": "2024-12-28T00:01:00Z", "value": 2}`;

		const result = parseLog(logContent);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			timestamp: "2024-12-28T00:00:00Z",
			value: 1,
		});
		expect(result[1]).toEqual({
			timestamp: "2024-12-28T00:01:00Z",
			value: 2,
		});
	});

	it("should handle invalid JSON lines", () => {
		const logContent = `{"timestamp": "2024-12-28T00:00:00Z", "value": 1}
invalid json line
{"timestamp": "2024-12-28T00:01:00Z", "value": 2}`;

		const result = parseLog(logContent);
		expect(result).toHaveLength(3);
		expect(result[1]).toEqual({ raw: "invalid json line" });
	});

	it("should handle empty log content", () => {
		const result = parseLog("");
		expect(result).toHaveLength(0);
	});
});

describe("filterByTimestamp", () => {
	const testData = [
		{ timestamp: "2024-12-28T00:00:00Z", value: 1 },
		{ timestamp: "2024-12-28T00:01:00Z", value: 2 },
		{ timestamp: "2024-12-28T00:02:00Z", value: 3 },
	];

	it("should return all metrics when no filters are provided", () => {
		const result = filterByTimestamp(testData);
		expect(result).toHaveLength(3);
		expect(result).toEqual(testData); // Already sorted by timestamp
	});

	it("should filter metrics after start date", () => {
		const result = filterByTimestamp(testData, "2024-12-28T00:01:00Z");
		expect(result).toHaveLength(2);
		expect(result[0].value).toBe(2);
		expect(result[1].value).toBe(3);
	});

	it("should filter metrics before end date", () => {
		const result = filterByTimestamp(
			testData,
			undefined,
			"2024-12-28T00:01:00Z",
		);
		expect(result).toHaveLength(2);
		expect(result[0].value).toBe(1);
		expect(result[1].value).toBe(2);
	});

	it("should filter metrics between start and end date", () => {
		const result = filterByTimestamp(
			testData,
			"2024-12-28T00:00:30Z",
			"2024-12-28T00:01:30Z",
		);
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe(2);
	});

	it("should handle empty metrics array", () => {
		const result = filterByTimestamp([]);
		expect(result).toHaveLength(0);
	});

	it("should sort metrics by timestamp", () => {
		const unsortedData = [
			{ timestamp: "2024-12-28T00:02:00Z", value: 3 },
			{ timestamp: "2024-12-28T00:00:00Z", value: 1 },
			{ timestamp: "2024-12-28T00:01:00Z", value: 2 },
		];
		const result = filterByTimestamp(unsortedData);
		expect(result).toHaveLength(3);
		expect(result[0].value).toBe(1);
		expect(result[1].value).toBe(2);
		expect(result[2].value).toBe(3);
	});

	it("should handle invalid timestamps", () => {
		const dataWithInvalidTimestamp = [
			{ timestamp: "invalid", value: 1 },
			{ timestamp: "2024-12-28T00:01:00Z", value: 2 },
		];

		expect(() => filterByTimestamp(dataWithInvalidTimestamp)).not.toThrow();
	});
});

describe("processMetrics", () => {
	const testData = [
		{ timestamp: "2024-12-28T00:00:00Z", cpu: "10", memory: "50" },
		{ timestamp: "2024-12-28T00:01:00Z", cpu: "20", memory: "60" },
		{ timestamp: "2024-12-28T00:02:00Z", cpu: "30", memory: "70" },
		{ timestamp: "2024-12-28T00:03:00Z", cpu: "40", memory: "80" },
		{ timestamp: "2024-12-28T00:04:00Z", cpu: "50", memory: "90" },
	];

	it("should return all metrics when no options are provided", () => {
		const result = processMetrics(testData, {});

		expect(result).toHaveLength(5);
		expect(result[0].cpu).toBe("10");
		expect(result[4].cpu).toBe("50");
	});

	it("should limit the number of metrics", () => {
		const result = processMetrics(testData, { limit: 3 });

		expect(result).toHaveLength(3);
		expect(result[0].cpu).toBe("30");
		expect(result[2].cpu).toBe("50");
	});

	it("should filter by start date", () => {
		const result = processMetrics(testData, {
			start: "2024-12-28T00:02:00Z",
		});

		expect(result).toHaveLength(3);
		expect(result[0].cpu).toBe("30");
		expect(result[2].cpu).toBe("50");
	});

	it("should combine filtering and limit", () => {
		const result = processMetrics(testData, {
			start: "2024-12-28T00:01:00Z",
			limit: 2,
		});

		expect(result).toHaveLength(2);
		expect(result[0].cpu).toBe("40");
		expect(result[1].cpu).toBe("50");
	});

	it("should handle zero limit", () => {
		const result = processMetrics(testData, { limit: 0 });
		expect(result).toHaveLength(0);
	});

	it("should handle limit larger than dataset", () => {
		const result = processMetrics(testData, { limit: 10 });

		expect(result).toHaveLength(5);
		expect(result[0].cpu).toBe("10");
		expect(result[4].cpu).toBe("50");
	});
});

describe("processMetricsFromFile", () => {
	beforeEach(async () => {
		// Create test file with sample data
		const testData = [
			{ timestamp: "2024-12-28T00:00:00Z", cpu: 10, memory: 50 },
			{ timestamp: "2024-12-28T00:01:00Z", cpu: 20, memory: 60 },
			{ timestamp: "2024-12-28T00:02:00Z", cpu: 30, memory: 70 },
			{ timestamp: "2024-12-28T00:03:00Z", cpu: 40, memory: 80 },
			{ timestamp: "2024-12-28T00:04:00Z", cpu: 50, memory: 90 },
		]
			.map((line) => JSON.stringify(line))
			.join("\n");

		await fs.writeFile(TEST_LOG_FILE, testData);
	});

	afterEach(async () => {
		// Cleanup test file
		await fs.unlink(TEST_LOG_FILE).catch(() => {});
	});

	it("should efficiently read last N lines (tail optimization)", async () => {
		const result = await processMetricsFromFile(TEST_LOG_FILE, { limit: 2 });
		expect(result).toHaveLength(2);
		expect(result[0].cpu).toBe(40);
		expect(result[1].cpu).toBe(50);
	});

	it("should use cache for full file reads", async () => {
		// First read
		const start = performance.now();
		const result1 = await processMetricsFromFile(TEST_LOG_FILE, {});
		const firstReadTime = performance.now() - start;

		// Second read (should use cache)
		const start2 = performance.now();
		const result2 = await processMetricsFromFile(TEST_LOG_FILE, {});
		const secondReadTime = performance.now() - start2;

		expect(result1).toEqual(result2);
		expect(secondReadTime).toBeLessThan(firstReadTime);
	});

	it("should use cache for date filters", async () => {
		const result = await processMetricsFromFile(TEST_LOG_FILE, {
			start: "2024-12-28T00:02:00Z",
			end: "2024-12-28T00:03:00Z",
		});

		expect(result).toHaveLength(2);
		expect(result[0].cpu).toBe(30);
		expect(result[1].cpu).toBe(40);
	});

	it("should combine date filters with limit", async () => {
		const result = await processMetricsFromFile(TEST_LOG_FILE, {
			start: "2024-12-28T00:01:00Z",
			limit: 2,
		});

		expect(result).toHaveLength(2);
		expect(result[0].cpu).toBe(40);
		expect(result[1].cpu).toBe(50);
	});

	it("should handle non-existent file", async () => {
		await expect(
			processMetricsFromFile("non-existent.log", {}),
		).rejects.toThrow();
	});
});
