import { logger } from "./logger";

const baseUrl = process.env.INNGEST_BASE_URL ?? "";
const signingKey = process.env.INNGEST_SIGNING_KEY ?? "";

/** Event shape from GET /v1/events (https://api.inngest.com/v1/events) */
type InngestEventRow = {
	internal_id?: string;
	accountID?: string;
	environmentID?: string;
	source?: string;
	sourceID?: string | null;
	/** RFC3339 timestamp – API uses receivedAt, dev server may use received_at */
	receivedAt?: string;
	received_at?: string;
	id: string;
	name: string;
	data: Record<string, unknown>;
	user?: unknown;
	ts: number;
	v?: string | null;
	metadata?: {
		fetchedAt: string;
		cachedUntil: string | null;
	};
};

/** Run shape from GET /v1/events/{eventId}/runs – the actual job execution */
type InngestRun = {
	run_id: string;
	event_id: string;
	status: string; // "Running" | "Completed" | "Failed" | "Cancelled" | "Queued"?
	run_started_at?: string;
	ended_at?: string | null;
	output?: unknown;
	// dev server / API may use different casing
	run_started_at_ms?: number;
};

function getEventReceivedAt(ev: InngestEventRow): string | undefined {
	return ev.receivedAt ?? ev.received_at;
}

/** Map Inngest run status to BullMQ-style state for the UI */
function runStatusToState(
	status: string,
): "pending" | "active" | "completed" | "failed" | "cancelled" {
	const s = status.toLowerCase();
	if (s === "running") return "active";
	if (s === "completed") return "completed";
	if (s === "failed") return "failed";
	if (s === "cancelled") return "cancelled";
	if (s === "queued") return "pending";
	return "pending";
}

export const fetchInngestEvents = async () => {
	const maxEvents = MAX_EVENTS;
	const all: InngestEventRow[] = [];
	let cursor: string | undefined;

	do {
		const params = new URLSearchParams({ limit: "100" });
		if (cursor) {
			params.set("cursor", cursor);
		}

		const res = await fetch(`${baseUrl}/v1/events?${params}`, {
			headers: {
				Authorization: `Bearer ${signingKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!res.ok) {
			logger.warn("Inngest API error", {
				status: res.status,
				body: await res.text(),
			});
			break;
		}

		const body = (await res.json()) as {
			data?: InngestEventRow[];
			cursor?: string;
			nextCursor?: string;
		};
		const data = Array.isArray(body.data) ? body.data : [];
		all.push(...data);

		// Next page: API may return cursor/nextCursor, or use last event's internal_id (per API docs)
		const nextCursor =
			body.cursor ?? body.nextCursor ?? data[data.length - 1]?.internal_id;
		const hasMore = data.length === 100 && nextCursor && all.length < maxEvents;
		cursor = hasMore ? nextCursor : undefined;
	} while (cursor);

	return all.slice(0, maxEvents);
};

/** Fetch runs for a single event (GET /v1/events/{eventId}/runs) – runs are the actual jobs */
export const fetchInngestRunsForEvent = async (
	eventId: string,
): Promise<InngestRun[]> => {
	const res = await fetch(
		`${baseUrl}/v1/events/${encodeURIComponent(eventId)}/runs`,
		{
			headers: {
				Authorization: `Bearer ${signingKey}`,
				"Content-Type": "application/json",
			},
		},
	);
	if (!res.ok) {
		logger.warn("Inngest runs API error", {
			eventId,
			status: res.status,
			body: await res.text(),
		});
		return [];
	}
	const body = (await res.json()) as { data?: InngestRun[] };
	return Array.isArray(body.data) ? body.data : [];
};

/** One row for the queue UI (BullMQ-compatible shape) */
export type DeploymentJobRow = {
	id: string;
	name: string;
	data: Record<string, unknown>;
	timestamp: number;
	processedOn?: number;
	finishedOn?: number;
	failedReason?: string;
	state: string;
};

/** Build queue rows from events + their runs (one row per run, or pending if no run yet) */
function buildDeploymentRowsFromRuns(
	events: InngestEventRow[],
	runsByEventId: Map<string, InngestRun[]>,
	serverId: string,
): DeploymentJobRow[] {
	const requested = events.filter(
		(e) =>
			e.name === "deployment/requested" &&
			(e.data as Record<string, unknown>)?.serverId === serverId,
	);
	const rows: DeploymentJobRow[] = [];

	for (const ev of requested) {
		const data = (ev.data ?? {}) as Record<string, unknown>;
		const runs = runsByEventId.get(ev.id) ?? [];

		if (runs.length === 0) {
			// Queued: event received but no run yet
			rows.push({
				id: ev.id,
				name: ev.name,
				data,
				timestamp: ev.ts,
				processedOn: ev.ts,
				finishedOn: undefined,
				failedReason: undefined,
				state: "pending",
			});
			continue;
		}

		for (const run of runs) {
			const state = runStatusToState(run.status);
			const runStartedMs =
				run.run_started_at_ms ??
				(run.run_started_at ? new Date(run.run_started_at).getTime() : ev.ts);
			const endedMs = run.ended_at
				? new Date(run.ended_at).getTime()
				: undefined;
			const failedReason =
				state === "failed" &&
				run.output &&
				typeof run.output === "object" &&
				"error" in run.output
					? String((run.output as { error?: unknown }).error)
					: undefined;

			rows.push({
				id: run.run_id,
				name: ev.name,
				data,
				timestamp: runStartedMs,
				processedOn: runStartedMs,
				finishedOn:
					state === "completed" || state === "failed" || state === "cancelled"
						? endedMs
						: undefined,
				failedReason,
				state,
			});
		}
	}

	return rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/** Fetch deployment jobs for a server: events → runs → rows (correct model: runs = jobs) */
export const fetchDeploymentJobs = async (
	serverId: string,
): Promise<DeploymentJobRow[]> => {
	if (!signingKey) {
		logger.warn("INNGEST_SIGNING_KEY not set, returning empty jobs list");
		return [];
	}
	if (!baseUrl) {
		throw new Error("INNGEST_BASE_URL is required to list deployment jobs");
	}

	const events = await fetchInngestEvents();

	const requestedForServer = events.filter(
		(e) =>
			e.name === "deployment/requested" &&
			(e.data as Record<string, unknown>)?.serverId === serverId,
	);
	// Limit to avoid too many run fetches
	const toFetch = requestedForServer.slice(0, 50);
	const runsByEventId = new Map<string, InngestRun[]>();

	await Promise.all(
		toFetch.map(async (ev) => {
			const runs = await fetchInngestRunsForEvent(ev.id);
			runsByEventId.set(ev.id, runs);
		}),
	);

	return buildDeploymentRowsFromRuns(events, runsByEventId, serverId);
};

const DEFAULT_MAX_EVENTS = 500;

const MAX_EVENTS = DEFAULT_MAX_EVENTS;
