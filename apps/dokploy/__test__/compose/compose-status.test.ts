import { resolveComposeStatus } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("resolveComposeStatus", () => {
	it("reports done when an idle compose has a running container", () => {
		expect(
			resolveComposeStatus("idle", [{ state: "exited" }, { state: "running" }]),
		).toBe("done");
	});

	it("keeps idle when no container is running", () => {
		expect(resolveComposeStatus("idle", [{ state: "exited" }])).toBe("idle");
		expect(resolveComposeStatus("idle", [])).toBe("idle");
	});

	it("never overrides non-idle statuses", () => {
		for (const status of ["running", "done", "error"] as const) {
			expect(resolveComposeStatus(status, [{ state: "running" }])).toBe(status);
		}
	});
});
