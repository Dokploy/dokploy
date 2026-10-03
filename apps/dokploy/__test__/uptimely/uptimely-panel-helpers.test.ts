import { describe, expect, it } from "vitest";
import {
	dayBarClass,
	dayTooltip,
	displayUrl,
	formatRelativeTime,
	formatUptimePercent,
	isOfflineStatus,
	preflightWarning,
} from "@/components/dashboard/monitoring/uptimely/uptimely-panel-helpers";

describe("preflightWarning", () => {
	it("explains a 404 in plain words", () => {
		expect(
			preflightWarning({
				url: "https://openrouter.devino.ca/",
				status: 404,
				ok: false,
			}),
		).toBe(
			"https://openrouter.devino.ca returns 404, so Uptimely will report it Offline. Set a path that returns 200, such as /health.",
		);
	});

	it("explains an unreachable URL", () => {
		expect(
			preflightWarning({
				url: "https://x.example.com/health",
				status: null,
				ok: false,
				error: "Timed out after 5s",
			}),
		).toBe(
			"https://x.example.com/health could not be reached (Timed out after 5s), so Uptimely will report it Offline.",
		);
	});

	it("says nothing about a healthy URL", () => {
		expect(
			preflightWarning({
				url: "https://a.example.com/",
				status: 200,
				ok: true,
			}),
		).toBeNull();
		expect(displayUrl("https://a.example.com/")).toBe("https://a.example.com");
	});
});

describe("timeline presentation", () => {
	it("draws no-data as a hollow dashed bar, never as a filled one", () => {
		expect(dayBarClass("no-data")).toContain("border-dashed");
		expect(dayBarClass("no-data")).toContain("bg-transparent");
		expect(dayBarClass("operational")).toContain("bg-green-500");
		expect(dayBarClass("offline")).toContain("bg-red-500");
	});

	it("words every bar tooltip", () => {
		expect(
			dayTooltip({ day: "2026-09-22", state: "no-data", status: null }),
		).toBe("2026-09-22: no data (not monitored yet)");
		expect(
			dayTooltip({
				day: "2026-09-22",
				state: "offline",
				status: { name: "Offline" },
			}),
		).toBe("2026-09-22: Offline");
		expect(
			dayTooltip({ day: "2026-09-22", state: "unknown", status: null }),
		).toBe("2026-09-22: Unknown");
	});

	it("formats uptime without rounding up to 100%", () => {
		expect(formatUptimePercent(100)).toBe("100%");
		expect(formatUptimePercent(99.96)).toBe("99.9%");
		expect(formatUptimePercent(0)).toBe("0.0%");
		expect(formatUptimePercent(null)).toBeNull();
	});

	it("formats relative times", () => {
		const now = Date.parse("2026-09-22T12:00:00Z");
		expect(formatRelativeTime("2026-09-22T11:59:30Z", now)).toBe("just now");
		expect(formatRelativeTime("2026-09-22T11:58:00Z", now)).toBe("2 min ago");
		expect(formatRelativeTime("2026-09-22T09:00:00Z", now)).toBe("3 h ago");
		expect(formatRelativeTime("2026-09-17T12:00:00Z", now)).toBe("5 d ago");
		expect(formatRelativeTime(null, now)).toBeNull();
		expect(formatRelativeTime("garbage", now)).toBeNull();
	});

	it("recognises an offline status by name", () => {
		expect(isOfflineStatus({ name: "Offline" })).toBe(true);
		expect(isOfflineStatus({ name: "Operational" })).toBe(false);
		expect(isOfflineStatus(null)).toBe(false);
	});
});
