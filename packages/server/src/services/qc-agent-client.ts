const QC_AGENT_BASE_URL = process.env.QC_AGENT_BASE_URL;
const QC_AGENT_API_KEY = process.env.QC_AGENT_API_KEY;
export const QC_AGENT_TIMEOUT_MS =
	Number(process.env.QC_AGENT_TIMEOUT_SECONDS ?? 300) * 1000;
const QC_AGENT_POLL_INTERVAL_MS = 3000;

export interface QcRunResult {
	status: "ready" | "error";
	content: string | null;
	version: number;
}

interface QcRunHandle {
	runId: string;
}

interface QcProjectHandle {
	projectId: string;
	status: "cloning" | "ready" | "failed";
}

const qcFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
	if (!QC_AGENT_BASE_URL) {
		throw new Error("QC_AGENT_BASE_URL is not configured");
	}

	const response = await fetch(`${QC_AGENT_BASE_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${QC_AGENT_API_KEY ?? ""}`,
			...init?.headers,
		},
	});

	if (!response.ok) {
		throw new Error(
			`QC agent request failed (${response.status}): ${await response.text()}`,
		);
	}

	return response.json() as Promise<T>;
};

const pollRun = async (
	qcProjectId: string,
	runId: string,
): Promise<QcRunResult> => {
	const deadline = Date.now() + QC_AGENT_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const run = await qcFetch<QcRunResult>(
			`/api/external/projects/${qcProjectId}/runs/${runId}`,
		);
		if (run.status === "ready" || run.status === "error") {
			return run;
		}
		await new Promise((resolve) =>
			setTimeout(resolve, QC_AGENT_POLL_INTERVAL_MS),
		);
	}

	throw new Error(
		`QC agent run ${runId} timed out after ${QC_AGENT_TIMEOUT_MS}ms`,
	);
};

// Get-or-create by repo URL — no one has to go create a Project through
// QC_Agent_Tool's own UI first. Two applications pointing at the same repo
// resolve to the same QC_Agent_Tool project (one clone, one synced
// workspace), so calling this again for an already-resolved app is cheap
// and safe, not just idempotent-by-accident.
export const resolveQcProject = async (params: {
	repoUrl: string;
	name?: string;
}): Promise<string> => {
	const { projectId, status } = await qcFetch<QcProjectHandle>(
		"/api/external/projects/resolve",
		{
			method: "POST",
			body: JSON.stringify({ repoUrl: params.repoUrl, name: params.name }),
		},
	);

	if (status === "ready") {
		return projectId;
	}
	if (status === "failed") {
		throw new Error(`QC agent failed to clone ${params.repoUrl}`);
	}

	// "cloning" — first time this repo is resolved. Reuses the same poll
	// budget/interval as a test-plan run; a first clone is a one-time cost,
	// every later deploy of this app hits the "ready" branch above instead.
	const deadline = Date.now() + QC_AGENT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) =>
			setTimeout(resolve, QC_AGENT_POLL_INTERVAL_MS),
		);
		const project = await qcFetch<QcProjectHandle>(
			"/api/external/projects/resolve",
			{
				method: "POST",
				body: JSON.stringify({ repoUrl: params.repoUrl, name: params.name }),
			},
		);
		if (project.status === "ready") {
			return project.projectId;
		}
		if (project.status === "failed") {
			throw new Error(`QC agent failed to clone ${params.repoUrl}`);
		}
	}

	throw new Error(
		`QC agent project for ${params.repoUrl} is still cloning after timeout`,
	);
};

// First deploy: no test-plan exists yet, so generate one from scratch and
// let the agent self-refine it for coverage.
export const runTestPlanGenerate = async (params: {
	qcProjectId: string;
}): Promise<QcRunResult> => {
	const { runId } = await qcFetch<QcRunHandle>(
		`/api/external/projects/${params.qcProjectId}/test-plan/generate`,
		{ method: "POST" },
	);
	return pollRun(params.qcProjectId, runId);
};

// Redeploy: QC_Agent_Tool re-syncs its own workspace copy of the repo and
// diffs against its last-synced snapshot itself (see its "auto sync"
// mechanism) — dokploy does not need to compute or pass commit SHAs.
export const runTestPlanUpdate = async (params: {
	qcProjectId: string;
}): Promise<QcRunResult> => {
	const { runId } = await qcFetch<QcRunHandle>(
		`/api/external/projects/${params.qcProjectId}/test-plan/update`,
		{ method: "POST" },
	);
	return pollRun(params.qcProjectId, runId);
};
