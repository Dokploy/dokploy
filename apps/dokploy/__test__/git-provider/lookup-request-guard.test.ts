import { describe, expect, it } from "vitest";
import { createLookupRequestGuard } from "@/components/dashboard/shared/lookup-request-guard";

describe("createLookupRequestGuard", () => {
	it("invalidates a response after its provider context changes", () => {
		const guard = createLookupRequestGuard();
		guard.setContext("github:account-one");
		const request = guard.begin();

		guard.setContext("github:account-two");

		expect(guard.isCurrent(request)).toBe(false);
	});

	it("keeps only the newest request active", () => {
		const guard = createLookupRequestGuard();
		guard.setContext("gitea:account:owner/repository");
		const first = guard.begin();
		const second = guard.begin();

		expect(guard.isCurrent(first)).toBe(false);
		expect(guard.isCurrent(second)).toBe(true);
	});

	it("invalidates a response when the lookup unmounts", () => {
		const guard = createLookupRequestGuard();
		const request = guard.begin();

		guard.cancel();

		expect(guard.isCurrent(request)).toBe(false);
	});
});
