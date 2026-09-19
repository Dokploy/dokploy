import { getDeploymentCommitDescription } from "@dokploy/server/utils/deployment-description";
import { describe, expect, it } from "vitest";

describe("deployment description after commit enrichment", () => {
	it("retains tag metadata separately from the actual checked-out commit", () => {
		expect(getDeploymentCommitDescription("Tag: go-3", "built-sha")).toBe(
			"Tag: go-3\nCommit: built-sha",
		);
	});
	it.each(["", "  ", "Hash: abc123", "Commit: abc123"])(
		"keeps a single commit line for %j",
		(description) => {
			expect(getDeploymentCommitDescription(description, "abc123")).toBe(
				"Commit: abc123",
			);
		},
	);
	it("preserves a different triggering push SHA", () => {
		expect(
			getDeploymentCommitDescription("Hash: pushed-sha", "built-sha"),
		).toBe("Hash: pushed-sha\nCommit: built-sha");
	});
});
