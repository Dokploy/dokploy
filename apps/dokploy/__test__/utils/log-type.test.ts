import { getLogType } from "@/components/dashboard/docker/logs/utils";
import { describe, expect, test } from "vitest";

describe("getLogType", () => {
	test("does not classify ofelia success summary as error", () => {
		// Real line from issue #4538: a successful job run (failed: false, error: none)
		const line =
			'NOTICE [Job "sync-1m" (e1305c5b54b1)] Finished in "326.16795ms", failed: false, skipped: false, error: none';

		expect(getLogType(line).type).not.toBe("error");
	});

	test("treats explicit no-error values as non-error", () => {
		expect(getLogType("error: none").type).not.toBe("error");
		expect(getLogType("error: null").type).not.toBe("error");
		expect(getLogType("error: false").type).not.toBe("error");
		expect(getLogType("failed: false").type).not.toBe("error");
		expect(getLogType("failed: 0").type).not.toBe("error");
	});

	test("still classifies genuine errors as error", () => {
		expect(getLogType("error: connection refused").type).toBe("error");
		expect(getLogType("failed: true").type).toBe("error");
		expect(getLogType("[ERROR] something went wrong").type).toBe("error");
		expect(getLogType("Uncaught Exception: boom").type).toBe("error");
	});

	test("classifies a real ofelia failure as error", () => {
		const line =
			'NOTICE [Job "sync-1m" (e1305c5b54b1)] Finished in "326.16795ms", failed: true, skipped: false, error: connection timed out';

		expect(getLogType(line).type).toBe("error");
	});
});
