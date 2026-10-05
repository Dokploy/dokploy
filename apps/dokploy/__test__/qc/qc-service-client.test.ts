import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.fn();

const load = async () => {
	vi.resetModules();
	process.env.QC_SERVICE_BASE_URL = "http://qc.test";
	process.env.QC_SERVICE_API_KEY = "secret";
	process.env.QC_SERVICE_TIMEOUT_SECONDS = "9";
	return await import("@dokploy/server/services/qc-service-client");
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const run = (status: string) => ({
	runId: "run1",
	status,
	planVersion: null,
	verdict: null,
	stages: [],
	error: null,
});

describe("qc-service-client", () => {
	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		delete process.env.QC_SERVICE_BASE_URL;
	});

	test("creates a run with the bearer key and an Idempotency-Key", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(json(run("queued"), 202));

		await client.createQcRun({
			repoUrl: "https://github.com/o/r.git",
			branch: "main",
			commitSha: "a".repeat(40),
			name: "app",
			idempotencyKey: "dep1",
		});

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://qc.test/v1/runs");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer secret");
		expect(headers["Idempotency-Key"]).toBe("dep1");
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({
			repoUrl: "https://github.com/o/r.git",
			branch: "main",
			stages: ["plan"],
		});
		expect(body.policy).toEqual({ timeoutSec: 30 });
	});

	test("sends force only when asked", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(json(run("queued"), 202));
		await client.createQcRun({
			repoUrl: "u",
			branch: "b",
			commitSha: "a".repeat(40),
			force: true,
			idempotencyKey: "k",
		});
		const body = JSON.parse(
			(fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
		);
		expect(body.policy.force).toBe(true);
	});

	test("surfaces the service's error body", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(
			json(
				{ error: { code: "unauthorized", message: "Invalid API key" } },
				401,
			),
		);
		await expect(client.getQcRun("run1")).rejects.toThrow(
			/401.*Invalid API key/,
		);
	});

	test("fails clearly when the service is not configured", async () => {
		vi.resetModules();
		delete process.env.QC_SERVICE_BASE_URL;
		const client = await import("@dokploy/server/services/qc-service-client");
		await expect(client.getQcRun("run1")).rejects.toThrow(
			"QC_SERVICE_BASE_URL is not configured",
		);
	});

	test("waits until the run reaches a terminal state", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock
			.mockResolvedValueOnce(json(run("queued")))
			.mockResolvedValueOnce(json(run("running")))
			.mockResolvedValueOnce(json(run("done")));

		const pending = client.waitForQcRun("run1");
		await vi.advanceTimersByTimeAsync(7000);
		expect((await pending).status).toBe("done");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	test("cancels the run on the service when the wait times out", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
			init?.method === "POST" ? json(run("cancelled")) : json(run("running")),
		);

		const pending = client.waitForQcRun("run1");
		const assertion = expect(pending).rejects.toThrow(/timed out/);
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;

		const cancel = fetchMock.mock.calls.find(
			([url]) => typeof url === "string" && url.endsWith("/cancel"),
		);
		expect(cancel).toBeTruthy();
	});

	test("downloads the plan markdown", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(new Response("# plan"));
		expect(await client.getQcPlanMarkdown("run1")).toBe("# plan");
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
			"http://qc.test/v1/runs/run1/artifacts/test-plan.md",
		);
	});
});
