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

	test("asks for the stages it is given", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(json(run("queued"), 202));
		await client.createQcRun({
			repoUrl: "u",
			branch: "b",
			commitSha: "a".repeat(40),
			stages: ["plan", "generate", "triage"],
			idempotencyKey: "k",
		});
		const body = JSON.parse(
			(fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
		);
		expect(body.stages).toEqual(["plan", "generate", "triage"]);
	});

	test("can stop waiting as soon as the run wants the test results", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock
			.mockResolvedValueOnce(json(run("running")))
			.mockResolvedValueOnce(json(run("awaiting_exec")));

		const pending = client.waitForQcRun("run1", { untilAwaitingExec: true });
		await vi.advanceTimersByTimeAsync(4000);
		expect((await pending).status).toBe("awaiting_exec");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("keeps waiting through awaiting_exec unless told otherwise", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock
			.mockResolvedValueOnce(json(run("awaiting_exec")))
			.mockResolvedValueOnce(json(run("done")));
		const pending = client.waitForQcRun("run1");
		await vi.advanceTimersByTimeAsync(4000);
		expect((await pending).status).toBe("done");
	});

	test("downloads the test bundle only if it matches its checksum", async () => {
		const client = await load();
		const bytes = Buffer.from("tarball");
		const { createHash } = await import("node:crypto");
		const sha = createHash("sha256").update(bytes).digest("hex");

		fetchMock.mockResolvedValueOnce(
			new Response(bytes, { headers: { "X-Sha256": sha } }),
		);
		expect((await client.getQcTestBundle("run1")).toString()).toBe("tarball");

		fetchMock.mockResolvedValueOnce(
			new Response(bytes, { headers: { "X-Sha256": "0".repeat(64) } }),
		);
		await expect(client.getQcTestBundle("run1")).rejects.toThrow(/checksum/);

		fetchMock.mockResolvedValueOnce(new Response(bytes));
		await expect(client.getQcTestBundle("run1")).rejects.toThrow(/checksum/);
	});

	test("reads the manifest and posts the results", async () => {
		const client = await load();
		fetchMock.mockResolvedValueOnce(
			json({ language: "go", command: "go test" }),
		);
		expect((await client.getQcManifest("run1")).language).toBe("go");
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
			"http://qc.test/v1/runs/run1/artifacts/tests.manifest.json",
		);

		fetchMock.mockResolvedValueOnce(json(run("triaging"), 202));
		await client.postQcExecResult("run1", {
			exitCode: 1,
			durationSec: 3,
			resultsText: "x",
			logTail: "tail",
		});
		const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toBe("http://qc.test/v1/runs/run1/exec-result");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			exitCode: 1,
			durationSec: 3,
			resultsText: "x",
			logTail: "tail",
		});
	});

	test("downloads the run report", async () => {
		const client = await load();
		fetchMock.mockResolvedValue(new Response("<html>report</html>"));
		expect(await client.getQcRunReport("run1")).toBe("<html>report</html>");
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
			"http://qc.test/v1/runs/run1/artifacts/run-report.html",
		);
	});

	test("asks for callbacks only when both the URL and the secret are set", async () => {
		const create = async () => {
			const client = await load();
			fetchMock.mockResolvedValue(json(run("queued"), 202));
			await client.createQcRun({
				repoUrl: "u",
				branch: "b",
				commitSha: "a".repeat(40),
				idempotencyKey: "k",
			});
			return JSON.parse(
				(fetchMock.mock.calls.at(-1) as [string, RequestInit])[1]
					.body as string,
			);
		};
		expect((await create()).callbackUrl).toBeUndefined();

		process.env.QC_SERVICE_CALLBACK_URL = "https://dokploy.test/api/qc/webhook";
		expect((await create()).callbackUrl).toBeUndefined();

		process.env.QC_SERVICE_WEBHOOK_SECRET = "s";
		expect((await create()).callbackUrl).toBe(
			"https://dokploy.test/api/qc/webhook",
		);
		process.env.QC_SERVICE_CALLBACK_URL = undefined;
		process.env.QC_SERVICE_WEBHOOK_SECRET = undefined;
		delete process.env.QC_SERVICE_CALLBACK_URL;
		delete process.env.QC_SERVICE_WEBHOOK_SECRET;
	});

	test("a callback wakes the wait before the next poll is due", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock
			.mockResolvedValueOnce(json(run("running")))
			.mockResolvedValueOnce(json(run("done")));

		const pending = client.waitForQcRun("run1");
		await vi.advanceTimersByTimeAsync(0); // the first poll is in flight
		client.notifyQcRun("run1");
		await vi.advanceTimersByTimeAsync(0);

		expect((await pending).status).toBe("done");
		expect(fetchMock).toHaveBeenCalledTimes(2); // no 3 s wait in between
	});

	test("a callback for another run does not wake this wait", async () => {
		vi.useFakeTimers();
		const client = await load();
		fetchMock
			.mockResolvedValueOnce(json(run("running")))
			.mockResolvedValueOnce(json(run("done")));
		const pending = client.waitForQcRun("run1");
		await vi.advanceTimersByTimeAsync(0);
		client.notifyQcRun("another");
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(3000);
		expect((await pending).status).toBe("done");
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
