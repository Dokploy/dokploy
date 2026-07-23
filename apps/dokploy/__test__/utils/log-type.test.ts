import { getLogType } from "@/components/dashboard/docker/logs/utils";
import { describe, expect, test } from "vitest";

describe("getLogType", () => {
	/** Job-scheduler completion lines report "error: none" / "failed: false";
	 * these are successful runs and must not be classified as errors. */
	test("does not classify a scheduler 'finished' line as error", () => {
		const line =
			'▶ NOTICE Finished job "nightly-task" in "1.2s", failed: false, skipped: false, error: none';

		expect(getLogType(line).type).not.toBe("error");
	});

	/** A bare "error: none" key/value pair carries no error. */
	test("treats 'error: none' as non-error", () => {
		expect(getLogType("error: none").type).not.toBe("error");
	});

	/** The no-error exclusion must be value-specific, not a blanket suppressor:
	 * a real failure on the same line still classifies as an error. */
	test("classifies mixed line with a real failure as error", () => {
		expect(getLogType("error: none, failed: true").type).toBe("error");
	});

	/** Genuine error keywords followed by a real value still classify as error. */
	test("classifies 'error: connection refused' as error", () => {
		expect(getLogType("error: connection refused").type).toBe("error");
	});

	/** "failed to <action>" describes a real failure, not a "failed: false" flag. */
	test("classifies 'failed to connect' as error", () => {
		expect(getLogType("failed to connect to database").type).toBe("error");
	});

	/** Bare NOTICE is informational and must short-circuit before the error branch. */
	test("classifies bare 'NOTICE' line as info", () => {
		expect(getLogType("▶ NOTICE scheduler started").type).toBe("info");
	});
});
