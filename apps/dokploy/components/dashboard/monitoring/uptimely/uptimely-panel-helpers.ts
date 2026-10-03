/**
 * Pure helpers for the Uptimely panel (kept out of the component so they can
 * be unit-tested without a DOM).
 */

export const CHECK_PATH_MAX_LENGTH = 200;

export interface PreflightResultLike {
	url: string;
	status: number | null;
	ok: boolean;
	error?: string;
}

/**
 * Early feedback for the "Path to check" input; mirrors the server schema
 * (`uptimelyCheckPathSchema`), which stays the authority. Empty is valid: no
 * path means the domain's own URL is monitored, as before.
 */
export const checkPathError = (value: string): string | null => {
	if (value === "") return null;
	if (value.length > CHECK_PATH_MAX_LENGTH) {
		return `Use at most ${CHECK_PATH_MAX_LENGTH} characters`;
	}
	if (!value.startsWith("/")) return "The path must start with /";
	if (value.startsWith("//")) return "The path cannot start with //";
	if (!/^[\x21-\x7e]*$/.test(value) || /[\\#]/.test(value)) {
		return "Use a plain path without spaces, backslashes or #";
	}
	return null;
};

/** The URL as shown to people: no trailing slash on a bare host. */
export const displayUrl = (url: string) => url.replace(/\/$/, "");

/** One-line explanation for a URL Uptimely would report Offline; null when it is fine. */
export const preflightWarning = (result: PreflightResultLike): string | null => {
	if (result.ok) return null;
	const url = displayUrl(result.url);
	if (result.status === null) {
		return `${url} could not be reached${result.error ? ` (${result.error})` : ""}, so Uptimely will report it Offline.`;
	}
	return `${url} returns ${result.status}, so Uptimely will report it Offline. Set a path that returns 200, such as /health.`;
};

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export const formatRelativeTime = (
	iso: string | null | undefined,
	now: number = Date.now(),
): string | null => {
	if (!iso) return null;
	const time = Date.parse(iso);
	if (!Number.isFinite(time)) return null;
	const minutes = Math.floor((now - time) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours} h ago`;
	return `${Math.floor(hours / 24)} d ago`;
};

/** "99.9%"; never rounds a result below 100 up to "100%". */
export const formatUptimePercent = (percent: number | null | undefined) => {
	if (percent === null || percent === undefined) return null;
	if (percent >= 100) return "100%";
	return `${(Math.floor(percent * 10) / 10).toFixed(1)}%`;
};

export type DayState =
	| "operational"
	| "degraded"
	| "offline"
	| "maintenance"
	| "unknown"
	| "no-data";

export const DAY_STATE_LABEL: Record<DayState, string> = {
	operational: "Operational",
	degraded: "Degraded",
	offline: "Offline",
	maintenance: "Maintenance",
	unknown: "Unknown",
	"no-data": "No data",
};

/** Tooltip / aria text of one timeline bar. */
export const dayTooltip = (day: {
	day: string;
	state: DayState;
	status: { name: string } | null;
}) =>
	day.state === "no-data"
		? `${day.day}: no data (not monitored yet)`
		: `${day.day}: ${day.status?.name ?? DAY_STATE_LABEL[day.state]}`;

/**
 * Bar styling. Days with data are filled (Uptimely's own status color when it
 * gave one); days without data are a hollow dashed outline so "not monitored
 * yet" never reads as "up".
 */
export const dayBarClass = (state: DayState) => {
	switch (state) {
		case "no-data":
			return "border border-dashed border-muted-foreground/40 bg-transparent";
		case "operational":
			return "bg-green-500";
		case "degraded":
			return "bg-amber-500";
		case "offline":
			return "bg-red-500";
		case "maintenance":
			return "bg-blue-500";
		default:
			return "bg-muted-foreground/60";
	}
};

/** True when Uptimely's status name for a monitor means it is down. */
export const isOfflineStatus = (status: { name: string } | null | undefined) =>
	!!status && /offline|down|outage|fail|critical|error/i.test(status.name);
