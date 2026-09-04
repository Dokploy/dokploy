import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAiSettingById } from "@dokploy/server/services/ai";
import { analyzeServiceLogs } from "@dokploy/server/services/ai-log-analysis";
import { resolveLogContext } from "@dokploy/server/services/ai-log-context";
import { localFiles, openFiles } from "@dokploy/server/utils/ai/file-access";
import { selectAIProvider } from "@dokploy/server/utils/ai/select-ai-provider";
import { TRPCError } from "@trpc/server";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/ai", () => ({ getAiSettingById: vi.fn() }));
vi.mock("@dokploy/server/services/ai-log-context", () => ({
	resolveLogContext: vi.fn(),
}));
vi.mock("@dokploy/server/utils/ai/select-ai-provider", () => ({
	selectAIProvider: vi.fn(),
}));
vi.mock("@dokploy/server/services/server", () => ({ findServerById: vi.fn() }));
vi.mock("@dokploy/server/utils/ai/file-access", async (importOriginal) => ({
	...(await importOriginal<object>()),
	openFiles: vi.fn(),
}));

const ctx = { user: { id: "u" }, session: { activeOrganizationId: "org" } };
const input = {
	aiId: "ai",
	context: "build" as const,
	target: { type: "deployment" as const, deploymentId: "d" },
};
let directory: string;
let model: MockLanguageModelV3;
type ModelResult = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
function reply(
	content: ModelResult["content"],
	reason: ModelResult["finishReason"]["unified"] = "stop",
): ModelResult {
	return {
		content,
		finishReason: { unified: reason, raw: reason },
		usage: {
			inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 1, text: 1, reasoning: 0 },
		},
		warnings: [],
	};
}
const finalReply = reply([
	{ type: "text", text: "The error is caused by app.ts:2." },
]);
function settings(enableCodeInspection = true) {
	return {
		aiId: "ai",
		organizationId: "org",
		isEnabled: true,
		enableCodeInspection,
		logLineLimit: 2,
		apiUrl: "https://example.com/v1",
		apiKey: "test",
		model: "mock",
		name: "mock",
		createdAt: "",
	};
}
beforeEach(async () => {
	vi.resetAllMocks();
	directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "dokploy-ai-analysis-test-"),
	);
	await fs.writeFile(
		path.join(directory, "app.ts"),
		"const port = 80;\nthrow new Error('port in use');",
	);
	vi.mocked(getAiSettingById).mockResolvedValue(settings());
	vi.mocked(resolveLogContext).mockResolvedValue({
		logs: "ignored\nerror\nlast",
		source: { directory, serverId: null },
		truncated: false,
	});
	vi.mocked(openFiles).mockResolvedValue(localFiles);
	model = new MockLanguageModelV3({ doGenerate: finalReply });
	vi.mocked(selectAIProvider).mockReturnValue(
		(() => model) as unknown as ReturnType<typeof selectAIProvider>,
	);
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});

describe("AI log analysis", () => {
	it("runs a real SDK tool round and includes source evidence in the next model call", async () => {
		let calls = 0;
		model = new MockLanguageModelV3({
			doGenerate: async () =>
				calls++ === 0
					? reply(
							[
								{
									type: "tool-call",
									toolCallId: "read-1",
									toolName: "readFile",
									input: JSON.stringify({
										path: "app.ts",
										startLine: 2,
										endLine: 2,
									}),
								},
							],
							"tool-calls",
						)
					: finalReply,
		});
		const result = await analyzeServiceLogs(ctx, input);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"2: throw new Error",
		);
		expect(result).toMatchObject({
			lineCount: 2,
			sourceStatus: "inspected",
			inspectedFiles: ["app.ts"],
		});
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).not.toContain(
			"ignored",
		);
		expect(resolveLogContext).toHaveBeenCalledWith(ctx, input.target, 2, true);
		expect(result.notices.join(" ")).toContain("may differ");
	});
	it.each(["build", "runtime"] as const)(
		"uses the provider limit without source tools when disabled (%s)",
		async (context) => {
			vi.mocked(getAiSettingById).mockResolvedValue(settings(false));
			const result = await analyzeServiceLogs(ctx, { ...input, context });
			expect(result.lineCount).toBe(2);
			expect(openFiles).not.toHaveBeenCalled();
			expect(model.doGenerateCalls[0]?.tools).toBeUndefined();
		},
	);
	it("does not call the model for empty logs", async () => {
		vi.mocked(resolveLogContext).mockResolvedValue({
			logs: "",
			truncated: false,
		});
		expect((await analyzeServiceLogs(ctx, input)).lineCount).toBe(0);
		expect(model.doGenerateCalls).toHaveLength(0);
	});
	it("falls back visibly when source is unavailable", async () => {
		vi.mocked(openFiles).mockRejectedValue(new Error("missing checkout"));
		const result = await analyzeServiceLogs(ctx, input);
		expect(result.sourceStatus).toBe("unavailable");
		expect(result.notices.join(" ")).toContain("logs only");
		expect(model.doGenerateCalls[0]?.tools).toBeUndefined();
	});
	it("retries once without tools only when tool calling is unsupported", async () => {
		let calls = 0;
		model = new MockLanguageModelV3({
			doGenerate: async () => {
				if (calls++ === 0) throw new Error("tools are not supported");
				return finalReply;
			},
		});
		const result = await analyzeServiceLogs(ctx, input);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(model.doGenerateCalls[1]?.tools).toBeUndefined();
		expect(result.notices.join(" ")).toContain("does not support");
	});
	it("forces a final diagnosis after eight tool rounds", async () => {
		let calls = 0;
		model = new MockLanguageModelV3({
			doGenerate: async () =>
				++calls === 9
					? finalReply
					: reply(
							[
								{
									type: "tool-call",
									toolCallId: `list-${calls}`,
									toolName: "listFiles",
									input: "{}",
								},
							],
							"tool-calls",
						),
		});
		const result = await analyzeServiceLogs(ctx, input);
		expect(model.doGenerateCalls).toHaveLength(9);
		expect(model.doGenerateCalls[8]?.toolChoice).toEqual({ type: "none" });
		expect(result.notices.join(" ")).toContain("step limit");
	});
	it("stops before model/source access when authorization or log retrieval fails", async () => {
		vi.mocked(resolveLogContext).mockRejectedValue(
			new TRPCError({ code: "FORBIDDEN" }),
		);
		await expect(analyzeServiceLogs(ctx, input)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(openFiles).not.toHaveBeenCalled();
		expect(model.doGenerateCalls).toHaveLength(0);
	});
	it("reports provider context-limit errors without a silent retry", async () => {
		model = new MockLanguageModelV3({
			doGenerate: async () => {
				throw new Error("maximum context length exceeded");
			},
		});
		await expect(analyzeServiceLogs(ctx, input)).rejects.toThrow(
			"Reduce Log lines",
		);
		expect(model.doGenerateCalls).toHaveLength(1);
	});
	it("keeps legacy text requests log-only even when code inspection is enabled", async () => {
		const result = await analyzeServiceLogs(ctx, {
			aiId: "ai",
			context: "build",
			logs: "a\nb\nc",
		});
		expect(result.lineCount).toBe(2);
		expect(resolveLogContext).not.toHaveBeenCalled();
		expect(openFiles).not.toHaveBeenCalled();
		expect(result.sourceStatus).toBe("unavailable");
	});
});
