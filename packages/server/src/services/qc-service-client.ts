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

export interface QcStageView {
	stage: string;
	status: string;
	error?: string | null;
}

export interface QcRunView {
	runId: string;
	status: QcRunStatus;
	planVersion: number | null;
	verdict: string | null;
	stages: QcStageView[];
	error: { code: string; message: string } | null;
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
			stages: ["plan"],
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

// Waits for the run to reach a terminal state. A run that outlives the
// timeout is cancelled on the service too, so it can't keep holding the
// (repo, branch) slot after the deploy has given up on it.
export const waitForQcRun = async (runId: string): Promise<QcRunView> => {
	const deadline = Date.now() + QC_SERVICE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const run = await getQcRun(runId);
		if (isTerminal(run.status)) {
			return run;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	await cancelQcRun(runId).catch(() => {});
	throw new Error(
		`QC service run ${runId} timed out after ${QC_SERVICE_TIMEOUT_MS}ms`,
	);
};
