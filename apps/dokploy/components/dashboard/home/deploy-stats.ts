const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// removeLastTenDeployments runs before insert and trims any excess past 10 rows,
// so a service that has hit the retention cap retains 10 or 11 rows (10 kept
// plus the newly inserted deployment). Checking >= 10 detects both states.
const DEPLOYMENT_RETENTION_CAP = 10;

export interface DeployStatsInput {
	createdAt: string;
	applicationId?: string | null;
	composeId?: string | null;
}

export interface DeployStatsResult {
	value: string;
	delta: string | undefined;
}

function getServiceKey(deployment: DeployStatsInput): string | null {
	if (deployment.applicationId) {
		return `app:${deployment.applicationId}`;
	}
	if (deployment.composeId) {
		return `compose:${deployment.composeId}`;
	}
	return null;
}

export function computeDeployStats(
	deployments: readonly DeployStatsInput[] | undefined,
	now = Date.now(),
): DeployStatsResult {
	const lastStart = now - WEEK_MS;
	const prevStart = now - 2 * WEEK_MS;

	let lastCount = 0;
	let prevCount = 0;
	const byService = new Map<
		string,
		{ count: number; oldestCreatedAt: number }
	>();

	for (const d of deployments ?? []) {
		const t = new Date(d.createdAt).getTime();
		if (!Number.isFinite(t)) continue;

		if (t >= lastStart) {
			lastCount += 1;
		} else if (t >= prevStart) {
			prevCount += 1;
		}

		const serviceKey = getServiceKey(d);
		if (!serviceKey) continue;

		const existing = byService.get(serviceKey);
		if (existing) {
			existing.count += 1;
			if (t < existing.oldestCreatedAt) {
				existing.oldestCreatedAt = t;
			}
		} else {
			byService.set(serviceKey, { count: 1, oldestCreatedAt: t });
		}
	}

	// Deployment history is pruned per service to the newest 10 rows (plus the
	// current insert). If any service sits at that cap and its oldest surviving
	// row is still inside the 14-day comparison window, older deployments in
	// either 7-day bucket may have been deleted — making an exact count or a
	// week-over-week percentage unreliable.
	const historyMayBePruned = Array.from(byService.values()).some(
		(service) =>
			service.count >= DEPLOYMENT_RETENTION_CAP &&
			service.oldestCreatedAt > prevStart,
	);

	if (historyMayBePruned) {
		return {
			value: `${lastCount}+`,
			delta: "capped at 10 per service",
		};
	}

	let delta: string;
	if (prevCount > 0) {
		const pct = Math.round(((lastCount - prevCount) / prevCount) * 100);
		delta = `${pct >= 0 ? "+" : ""}${pct}% vs prev 7d`;
	} else if (lastCount > 0) {
		delta = "no prior data";
	} else {
		delta = "no activity yet";
	}

	return {
		value: String(lastCount),
		delta,
	};
}
