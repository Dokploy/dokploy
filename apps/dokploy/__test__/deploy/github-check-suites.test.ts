import { areCheckSuitesPassing } from "@dokploy/server/utils/providers/github";
import { describe, expect, it } from "vitest";

const suite = (
	status: string,
	conclusion: string | null,
	latest_check_runs_count = 1,
) => ({ status, conclusion, latest_check_runs_count });

describe("areCheckSuitesPassing", () => {
	it("is false when nothing has reported on the commit", () => {
		expect(areCheckSuitesPassing([])).toBe(false);
	});

	it("ignores suites without check runs", () => {
		// GitHub opens a suite for every installed app that could report
		// checks, and the ones that never do stay queued forever.
		expect(
			areCheckSuitesPassing([
				suite("queued", null, 0),
				suite("completed", "success"),
			]),
		).toBe(true);
	});

	it("is false while a reporting suite is still running", () => {
		expect(
			areCheckSuitesPassing([
				suite("completed", "success"),
				suite("in_progress", null),
			]),
		).toBe(false);
	});

	it("is false when a reporting suite did not pass", () => {
		for (const conclusion of [
			"failure",
			"cancelled",
			"timed_out",
			"action_required",
			"stale",
		]) {
			expect(
				areCheckSuitesPassing([
					suite("completed", "success"),
					suite("completed", conclusion),
				]),
			).toBe(false);
		}
	});

	it("treats neutral and skipped conclusions as passing", () => {
		expect(
			areCheckSuitesPassing([
				suite("completed", "success"),
				suite("completed", "neutral"),
				suite("completed", "skipped"),
			]),
		).toBe(true);
	});

	it("is false when only empty suites exist", () => {
		expect(areCheckSuitesPassing([suite("queued", null, 0)])).toBe(false);
	});
});
