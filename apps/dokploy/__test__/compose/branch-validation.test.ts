import { apiUpdateCompose } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const branchFields = [
	"branch",
	"gitlabBranch",
	"bitbucketBranch",
	"giteaBranch",
	"customGitBranch",
] as const;

describe("compose update validates provider branch names", () => {
	it.each(branchFields)("rejects shell metacharacters in %s", (field) => {
		const result = apiUpdateCompose.safeParse({
			composeId: "compose-1",
			[field]: "main; rm -rf /",
		});

		expect(result.success).toBe(false);
	});

	it.each(branchFields)("accepts a valid %s", (field) => {
		const result = apiUpdateCompose.safeParse({
			composeId: "compose-1",
			[field]: "feature/login-v2.0",
		});

		expect(result.success).toBe(true);
	});

	it.each(branchFields)("still allows clearing %s with null", (field) => {
		const result = apiUpdateCompose.safeParse({
			composeId: "compose-1",
			[field]: null,
		});

		expect(result.success).toBe(true);
	});
});
