import { beforeAll, describe, expect, it, vi } from "vitest";
import type { InngestEventRow, InngestRun } from "../../../api/src/service.js";

/**
 * `apps/api/src/service.ts` reads `process.env.INNGEST_*` at module load and
 * pulls in `pino` via `./logger.js`. Stub the env before the first import and
 * mock the logger so the suite stays hermetic (no pino-pretty worker thread,
 * no real Inngest credentials). The dynamic import in `beforeAll` guarantees
 * the module captures the stubbed env.
 */
vi.mock("../../../api/src/logger.js", () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.stubEnv("INNGEST_BASE_URL", "https://inngest.test");
vi.stubEnv("INNGEST_SIGNING_KEY", "test-key");

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

let service: typeof import("../../../api/src/service.js");
beforeAll(async () => {
	service = await import("../../../api/src/service.js");
});

const jsonResponse = (body: unknown): Response =>
	({ ok: true, status: 200, json: async () => body }) as Response;

function mockInngestApi(
	events: InngestEventRow[],
	runsByEventId: Record<string, InngestRun[]>,
) {
	mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		const runMatch = url.match(/\/v1\/events\/([^/]+)\/runs/);
		if (runMatch) {
			const eventId = decodeURIComponent(runMatch[1] as string);
			return jsonResponse({ data: runsByEventId[eventId] ?? [] });
		}
		return jsonResponse({ data: events });
	});
}

const mkEvent = (
	id: string,
	serverId: string | undefined,
	ts: number,
	data: Record<string, unknown> = {},
): InngestEventRow => ({
	id,
	name: "deployment/requested",
	data: { serverId, applicationId: `app-${id}`, ...data },
	ts,
});

const mkRun = (
	run_id: string,
	status: InngestRun["status"],
	overrides: Partial<InngestRun> = {},
): InngestRun => ({
	run_id,
	event_id: "evt-1",
	status,
	...overrides,
});

/**
 * The serialized-error shape the Inngest SDK (`serialize-error-cjs`) emits for
 * a failed `step.run`: keys are `__serialized`, `message`, `name`, `stack` — no
 * `error` key, even when the thrown error has an own `.error` property.
 */
const serializedError = (message: string): Record<string, unknown> => ({
	__serialized: true,
	name: "Error",
	message,
	stack: `Error: ${message}\n    at deploy (file:...)`,
});

describe("extractFailedReason", () => {
	it("reads `message` from the Inngest SDK's serialized error (no `error` key)", () => {
		expect(service.extractFailedReason("failed", serializedError("boom"))).toBe(
			"boom",
		);
	});

	it("returns undefined for non-failed states and falsy/absent output", () => {
		const output = serializedError("boom");
		for (const state of ["active", "completed", "pending", "cancelled"]) {
			expect(service.extractFailedReason(state, output)).toBeUndefined();
		}
		expect(service.extractFailedReason("failed", undefined)).toBeUndefined();
		expect(service.extractFailedReason("failed", null)).toBeUndefined();
		expect(service.extractFailedReason("failed", "")).toBeUndefined();
	});

	it("falls back to `error` when only that key is present", () => {
		expect(
			service.extractFailedReason("failed", { error: "fallback reason" }),
		).toBe("fallback reason");
	});

	it("returns a plain string output directly (legacy/dev-CLI shape)", () => {
		expect(service.extractFailedReason("failed", "command exited 1")).toBe(
			"command exited 1",
		);
	});
});

describe("buildDeploymentRowsFromRuns", () => {
	it("populates failedReason for a failed run from the serialized error", () => {
		const ev = mkEvent("evt-1", "server-1", 1000);
		const run = mkRun("run-1", "Failed", {
			run_started_at_ms: 2000,
			ended_at: "2026-09-03T21:17:56.462Z",
			output: serializedError("Server is inactive"),
		});
		const rows = service.buildDeploymentRowsFromRuns(
			[ev],
			new Map([["evt-1", [run]]]),
			"server-1",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe("run-1");
		expect(rows[0]!.state).toBe("failed");
		expect(rows[0]!.failedReason).toBe("Server is inactive");
	});

	it("leaves failedReason undefined for non-failed runs and emits a pending row", () => {
		const ev = mkEvent("evt-1", "server-1", 1000);
		const completed = mkRun("run-c", "Completed", {
			run_started_at_ms: 2000,
			ended_at: "2026-09-03T21:17:57.000Z",
			output: { ok: true },
		});
		const rows = service.buildDeploymentRowsFromRuns(
			[ev],
			new Map([["evt-1", [completed]]]),
			"server-1",
		);
		expect(rows[0]!.state).toBe("completed");
		expect(rows[0]!.failedReason).toBeUndefined();

		const pending = service.buildDeploymentRowsFromRuns(
			[ev],
			new Map(),
			"server-1",
		);
		expect(pending[0]!.state).toBe("pending");
		expect(pending[0]!.failedReason).toBeUndefined();
	});
});

describe("fetchDeploymentJobs (integration)", () => {
	it("surfaces the failure reason end-to-end from Inngest run output", async () => {
		const event = {
			id: "evt-1",
			name: "deployment/requested",
			data: { serverId: "server-1", applicationId: "app-1" },
			ts: 1000,
		} as InngestEventRow;
		const failedRun = {
			run_id: "run-1",
			event_id: "evt-1",
			status: "Failed",
			ended_at: "2026-09-03T21:17:56.462Z",
			run_started_at_ms: 2000,
			output: serializedError("Server is inactive"),
		} as InngestRun;

		mockInngestApi([event], { "evt-1": [failedRun] });

		const rows = await service.fetchDeploymentJobs("server-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]!.state).toBe("failed");
		expect(rows[0]!.failedReason).toBe("Server is inactive");
	});

	it("renders a completed run as completed with no failedReason", async () => {
		const event = {
			id: "evt-1",
			name: "deployment/requested",
			data: { serverId: "server-1", applicationId: "app-1" },
			ts: 1000,
		} as InngestEventRow;
		mockInngestApi([event], {
			"evt-1": [
				mkRun("run-1", "Completed", {
					run_started_at_ms: 2000,
					ended_at: "2026-09-03T21:18:00.000Z",
					output: { result: "deployed" },
				}),
			],
		});

		const rows = await service.fetchDeploymentJobs("server-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]!.state).toBe("completed");
		expect(rows[0]!.failedReason).toBeUndefined();
	});
});
