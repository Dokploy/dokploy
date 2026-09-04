import { apiCreateAi, apiUpdateAi } from "@dokploy/server/db/schema/ai";
import {
	analyzeLogsSchema,
	MAX_LOG_BYTES,
	selectLogWindow,
} from "@dokploy/server/utils/ai/log-analysis-schema";
import { describe, expect, it } from "vitest";

const provider = {
	name: "Test",
	apiUrl: "https://example.com/v1",
	apiKey: "key",
	model: "model",
	isEnabled: true,
};
describe("AI settings and log windows", () => {
	it("defaults existing create callers to 200 lines and no source access", () => {
		expect(apiCreateAi.parse(provider)).toMatchObject({
			logLineLimit: 200,
			enableCodeInspection: false,
		});
	});
	it.each([0, -1, 1.5, 10001, Number.NaN])(
		"rejects invalid limit %s for create and update",
		(logLineLimit) => {
			expect(apiCreateAi.safeParse({ ...provider, logLineLimit }).success).toBe(
				false,
			);
			expect(apiUpdateAi.safeParse({ aiId: "id", logLineLimit }).success).toBe(
				false,
			);
		},
	);
	it("preserves optional update semantics", () => {
		expect(apiUpdateAi.parse({ aiId: "id", name: "New" })).toEqual({
			aiId: "id",
			name: "New",
		});
	});
	it("selects recent lines and removes ANSI escape codes", () => {
		expect(
			selectLogWindow("old\r\n\x1b[31merror\x1b[0m\r\nlast\r\n", 2),
		).toEqual({ logs: "error\nlast", lineCount: 2, truncated: false });
	});
	it("counts available lines and handles empty logs", () => {
		expect(selectLogWindow("one\ntwo\n", 200).lineCount).toBe(2);
		expect(selectLogWindow("\n ", 200).lineCount).toBe(0);
	});
	it("bounds large log payloads and retains their end", () => {
		const result = selectLogWindow(
			`${"x".repeat(MAX_LOG_BYTES + 1)}\nlast`,
			200,
		);
		expect(result.truncated).toBe(true);
		expect(Buffer.byteLength(result.logs)).toBeLessThanOrEqual(MAX_LOG_BYTES);
		expect(result.logs.endsWith("last")).toBe(true);
	});
	it("accepts legacy text and target requests but rejects arbitrary target commands", () => {
		expect(
			analyzeLogsSchema.safeParse({
				aiId: "id",
				context: "build",
				logs: "error",
			}).success,
		).toBe(true);
		expect(
			analyzeLogsSchema.safeParse({
				aiId: "id",
				context: "build",
				target: { type: "deployment", deploymentId: "d" },
			}).success,
		).toBe(true);
		expect(
			analyzeLogsSchema.safeParse({
				aiId: "id",
				context: "runtime",
				target: {
					type: "runtime",
					containerId: "id;whoami",
					runType: "native",
				},
			}).success,
		).toBe(false);
	});
});
