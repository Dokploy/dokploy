import { describe, expect, it } from "vitest";
import {
	didServerIpChange,
	getHostsToAutoValidate,
	isCurrentValidation,
} from "@/components/dashboard/application/domains/validation";

describe("domain auto-validation", () => {
	it("only schedules enabled, unvalidated hosts", () => {
		const hosts = getHostsToAutoValidate(
			[
				{ host: "already.example.com", enabled: true },
				{ host: "disabled.example.com", enabled: false },
				{ host: "new.example.com", enabled: true },
			],
			new Set(["already.example.com"]),
		);

		expect(hosts).toEqual(["new.example.com"]);
	});

	it("rejects results from a previous service scope", () => {
		expect(
			isCurrentValidation({
				currentScopeRequestId: 2,
				currentHostRequestId: 1,
				hostRequestId: 1,
				scopeRequestId: 1,
			}),
		).toBe(false);
	});

	it("rejects an older request for the same host", () => {
		expect(
			isCurrentValidation({
				currentScopeRequestId: 1,
				currentHostRequestId: 2,
				hostRequestId: 1,
				scopeRequestId: 1,
			}),
		).toBe(false);
	});

	it("detects expected server IP changes", () => {
		expect(didServerIpChange("203.0.113.10", "203.0.113.11")).toBe(true);
		expect(didServerIpChange("203.0.113.10", "203.0.113.10")).toBe(false);
	});
});
