import { VALID_BRANCH_REGEX } from "@dokploy/server/utils/git-branch-validation";
import { describe, expect, it } from "vitest";

describe("VALID_BRANCH_REGEX", () => {
	it("rejects branch names with a leading slash", () => {
		expect(VALID_BRANCH_REGEX.test("/main")).toBe(false);
	});
});
