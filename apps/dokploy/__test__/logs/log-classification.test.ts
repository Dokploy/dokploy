import { getLogType } from "@/components/dashboard/docker/logs/utils";
import { expect, test } from "vitest";

test("classifies real failures as error", () => {
	expect(getLogType("Error: connection refused at db:5432").type).toBe(
		"error",
	);
	expect(getLogType("[ERROR] something went wrong").type).toBe("error");
	expect(getLogType("Deployment failed").type).toBe("error");
	expect(
		getLogType(
			'NOTICE [Job "sync-1m" (e1305c5b54b1)] Finished in "326ms", failed: true, skipped: false, error: exit code 1',
		).type,
	).toBe("error");
});

test("does not classify explicit non-error key/values as error (#4538)", () => {
	// ofelia job-completion summary for a successful run
	expect(
		getLogType(
			'NOTICE [Job "sync-1m" (e1305c5b54b1)] Finished in "326.16795ms", failed: false, skipped: false, error: none',
		).type,
	).not.toBe("error");

	expect(getLogType("request done, error: null").type).not.toBe("error");
	expect(getLogType("checks passed, failures=0").type).not.toBe("error");
	expect(getLogType('shutdown clean, error=""').type).not.toBe("error");
});

test("keeps statusCode-based classification", () => {
	expect(getLogType('{"statusCode": "500"}').type).toBe("error");
	expect(getLogType('{"statusCode": "204"}').type).toBe("success");
});
