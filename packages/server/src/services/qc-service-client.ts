import { createHash } from "node:crypto";

const QC_SERVICE_BASE_URL = process.env.QC_SERVICE_BASE_URL;
const QC_SERVICE_API_KEY = process.env.QC_SERVICE_API_KEY;
export const QC_SERVICE_TIMEOUT_MS =
	Number(process.env.QC_SERVICE_TIMEOUT_SECONDS ?? 900) * 1000;
const POLL_INTERVAL_MS = 3000;

export type QcRunStatus =
	| "queued"
	| "running"
	| "awaiting_exec"
	| "triaging"
	| "done"
	| "failed"
	| "cancelled";

export type QcStageName = "plan" | "generate" | "triage";

export interface QcStageView {
	stage: string;
	status: string;
	error?: string | null;
	output?: Record<string, unknown> | null;
}

export interface QcRunView {
	runId: string;
	status: QcRunStatus;
	planVersion: number | null;
	verdict: string | null;
	stages: QcStageView[];
	error: { code: string; message: string } | null;
	suite?: {
		language: string;
		framework: string;
		targetDir: string;
		files: number;
		scenarios: number;
	} | null;
}

// What the service needs to know about the generated tests to run them.
export interface QcManifest {
	language: string;
	framework: string;
	targetDir: string;
	cwd: string;
	install: string;
	installNeedsNetwork: boolean;
	command: string;
	resultsFormat:
		| "vitest-json"
		| "jest-json"
		| "mocha-json"
		| "junit-xml"
		| "go-test-json"
		| "text";
	timeoutSec: number;
	needsNetwork: boolean;
	files: string[];
	scenarios: string[];
}

export interface QcExecResult {
	exitCode: number;
	durationSec: number;
	resultsJson?: unknown;
	resultsText?: string;
	logTail: string;
}

const isTerminal = (status: QcRunStatus) =>
	status === "done" || status === "failed" || status === "cancelled";

const qcFetch = async (path: string, init?: RequestInit) => {
	if (!QC_SERVICE_BASE_URL) {
		throw new Error("QC_SERVICE_BASE_URL is not configured");
	}
	const response = await fetch(`${QC_SERVICE_BASE_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${QC_SERVICE_API_KEY ?? ""}`,
			...init?.headers,
		},
	});
	if (!response.ok) {
		throw new Error(
			`QC service request failed (${response.status}): ${await response.text()}`,
		);
	}
	return response;
};

export const createQcRun = async (params: {
	repoUrl: string;
	branch: string;
	commitSha: string;
	name?: string;
	force?: boolean;
	// "plan" only by default; add "generate" and "triage" to also get tests
	// generated and judged.
	stages?: QcStageName[];
	idempotencyKey: string;
}): Promise<QcRunView> => {
	const response = await qcFetch("/v1/runs", {
		method: "POST",
		headers: { "Idempotency-Key": params.idempotencyKey },
		body: JSON.stringify({
			repoUrl: params.repoUrl,
			branch: params.branch,
			commitSha: params.commitSha,
			name: params.name,
			stages: params.stages ?? ["plan"],
			policy: {
				timeoutSec: Math.max(30, Math.floor(QC_SERVICE_TIMEOUT_MS / 1000)),
				...(params.force ? { force: true } : {}),
			},
		}),
	});
	return (await response.json()) as QcRunView;
};

export const getQcRun = async (runId: string): Promise<QcRunView> =>
	(await (await qcFetch(`/v1/runs/${runId}`)).json()) as QcRunView;

export const cancelQcRun = async (runId: string): Promise<void> => {
	await qcFetch(`/v1/runs/${runId}/cancel`, { method: "POST" });
};

export const getQcPlanMarkdown = async (runId: string): Promise<string> =>
	await (await qcFetch(`/v1/runs/${runId}/artifacts/test-plan.md`)).text();

export const getQcManifest = async (runId: string): Promise<QcManifest> =>
	(await (
		await qcFetch(`/v1/runs/${runId}/artifacts/tests.manifest.json`)
	).json()) as QcManifest;

// The tests are code the service's model wrote, so what gets executed has to
// be exactly what the service stored: the sha256 header is checked here.
export const getQcTestBundle = async (runId: string): Promise<Buffer> => {
	const response = await qcFetch(`/v1/runs/${runId}/artifacts/tests.tar.gz`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const expected = response.headers.get("x-sha256");
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (!expected || expected !== actual) {
		throw new Error("The test bundle does not match its sha256 checksum");
	}
	return bytes;
};

export const postQcExecResult = async (
	runId: string,
	result: QcExecResult,
): Promise<void> => {
	await qcFetch(`/v1/runs/${runId}/exec-result`, {
		method: "POST",
		body: JSON.stringify(result),
	});
};

// Waits for the run to reach a terminal state, or (with `untilAwaitingExec`)
// to start waiting for Dokploy's test results. A run that outlives the
// timeout is cancelled on the service too, so it can't keep holding the
// (repo, branch) slot after the deploy has given up on it.
export const waitForQcRun = async (
	runId: string,
	options: { untilAwaitingExec?: boolean } = {},
): Promise<QcRunView> => {
	const deadline = Date.now() + QC_SERVICE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const run = await getQcRun(runId);
		if (
			isTerminal(run.status) ||
			(options.untilAwaitingExec && run.status === "awaiting_exec")
		) {
			return run;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	await cancelQcRun(runId).catch(() => {});
	throw new Error(
		`QC service run ${runId} timed out after ${QC_SERVICE_TIMEOUT_MS}ms`,
	);
};
