/**
 * Cloudflare Access session-duration presets, shared by the org defaults form
 * (settings) and the per-domain Access editor. Values use Cloudflare's duration
 * syntax and are accepted by the `cloudflareSessionDurationSchema` validator.
 */
export const CLOUDFLARE_SESSION_DURATIONS = [
	{ value: "30m", label: "30 minutes" },
	{ value: "1h", label: "1 hour" },
	{ value: "6h", label: "6 hours" },
	{ value: "12h", label: "12 hours" },
	{ value: "24h", label: "1 day" },
	{ value: "168h", label: "1 week" },
	{ value: "730h", label: "1 month" },
] as const;
