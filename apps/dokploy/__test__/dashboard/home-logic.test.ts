import { describe, expect, it } from "vitest";
import { getDeploymentWindowBounds } from "../../../../packages/server/src/services/deployment-window";
import { getScopedServerServiceCount } from "../../components/dashboard/home/home-logic";

describe("home dashboard service scoping", () => {
	it("does not fall back to an unscoped server total", () => {
		expect(getScopedServerServiceCount("server-a", { "server-a": 3 })).toBe(3);
		expect(getScopedServerServiceCount("server-a", {})).toBe(0);
		expect(getScopedServerServiceCount("server-b", { "server-a": 3 })).toBe(0);
	});
});

describe("home dashboard deployment windows", () => {
	it("uses a half-open previous window at the seven-day boundary", () => {
		const nowMs = Date.UTC(2026, 7, 11, 12);
		const { last7dStart, prev7dStart } = getDeploymentWindowBounds(nowMs);

		expect(last7dStart.getTime()).toBe(nowMs - 7 * 24 * 60 * 60 * 1000);
		expect(prev7dStart.getTime()).toBe(nowMs - 14 * 24 * 60 * 60 * 1000);

		const isInWindow = (
			createdAtMs: number,
			sinceMs: number,
			untilMs?: number,
		) =>
			createdAtMs >= sinceMs &&
			(untilMs === undefined || createdAtMs < untilMs);

		expect(isInWindow(last7dStart.getTime(), last7dStart.getTime())).toBe(true);
		expect(
			isInWindow(
				last7dStart.getTime(),
				prev7dStart.getTime(),
				last7dStart.getTime(),
			),
		).toBe(false);
		expect(
			isInWindow(
				prev7dStart.getTime(),
				prev7dStart.getTime(),
				last7dStart.getTime(),
			),
		).toBe(true);
	});
});
