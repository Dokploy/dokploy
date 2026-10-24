import { addDays, format, startOfDay, subDays } from "date-fns";

export const DEPLOYMENT_STATUSES = [
	"done",
	"error",
	"running",
	"cancelled",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

// Chart colors reference the Tailwind theme variables behind the dot classes,
// so dots and lines stay in sync in both light and dark mode.
export const deploymentStatusStyles: Record<
	DeploymentStatus,
	{ label: string; dotClass: string; color: string }
> = {
	done: {
		label: "Done",
		dotClass: "bg-emerald-500",
		color: "var(--color-emerald-500)",
	},
	error: {
		label: "Error",
		dotClass: "bg-red-500",
		color: "var(--color-red-500)",
	},
	running: {
		label: "Running",
		dotClass: "bg-amber-500",
		color: "var(--color-amber-500)",
	},
	cancelled: {
		label: "Cancelled",
		dotClass: "bg-muted-foreground/40",
		color: "var(--color-muted-foreground)",
	},
};

export const ACTIVITY_DAYS = 7;

export type DeploymentActivityDay = Record<DeploymentStatus, number> & {
	date: string;
	total: number;
};

type DeploymentLike = {
	createdAt: string;
	status: DeploymentStatus | null;
};

const toDayKey = (date: Date) => format(date, "yyyy-MM-dd");

/**
 * Calls `onDayChange` with the new local midnight each time the local day
 * rolls over, and returns a cleanup function. The delay is recomputed from the
 * clock on every tick, so a timer that fires early, late (sleep, background-tab
 * throttling), or across a DST change still lands on the right day.
 */
export const watchLocalDay = (onDayChange: (day: Date) => void) => {
	let current = startOfDay(new Date());
	let timer: ReturnType<typeof setTimeout>;

	const schedule = () => {
		const now = new Date();
		const delay = startOfDay(addDays(now, 1)).getTime() - now.getTime();
		timer = setTimeout(() => {
			const today = startOfDay(new Date());
			if (today.getTime() !== current.getTime()) {
				current = today;
				onDayChange(today);
			}
			schedule();
		}, delay);
	};

	schedule();
	return () => clearTimeout(timer);
};

/** Local midnight of the first day in a window of `days` calendar days ending today. */
export const getActivityWindowStart = (now: Date, days = ACTIVITY_DAYS) =>
	startOfDay(subDays(now, days - 1));

export const bucketDeploymentsByDay = (
	deployments: readonly DeploymentLike[],
	now: Date,
	days = ACTIVITY_DAYS,
) => {
	const start = getActivityWindowStart(now, days);
	const buckets = new Map<string, DeploymentActivityDay>();
	for (let i = 0; i < days; i++) {
		const date = toDayKey(addDays(start, i));
		buckets.set(date, {
			date,
			done: 0,
			error: 0,
			running: 0,
			cancelled: 0,
			total: 0,
		});
	}

	let total = 0;
	for (const deployment of deployments) {
		const bucket = buckets.get(toDayKey(new Date(deployment.createdAt)));
		if (!bucket) continue;
		// The column defaults to "running", so a null status is an in-flight deploy.
		bucket[deployment.status ?? "running"]++;
		bucket.total++;
		total++;
	}

	return { days: [...buckets.values()], total };
};
