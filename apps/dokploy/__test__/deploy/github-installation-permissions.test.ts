import {
	getGithubInstallationPermissions,
	getGithubToken,
} from "@dokploy/server/utils/providers/github";
import { describe, expect, it, vi } from "vitest";

const createOctokit = (authentication: Record<string, unknown>) => {
	const auth = vi.fn().mockResolvedValue(authentication);
	return { octokit: { auth } as never, auth };
};

describe("GitHub installation authentication", () => {
	it("still returns the installation token", async () => {
		const { octokit, auth } = createOctokit({
			token: "ghs_token",
			permissions: { checks: "read" },
		});

		await expect(getGithubToken(octokit)).resolves.toBe("ghs_token");
		expect(auth).toHaveBeenCalledWith({ type: "installation" });
	});

	it("reads the permissions granted to the installation from the same call", async () => {
		const { octokit } = createOctokit({
			token: "ghs_token",
			permissions: { checks: "read", contents: "read" },
		});

		await expect(getGithubInstallationPermissions(octokit)).resolves.toEqual({
			checks: "read",
			contents: "read",
		});
	});

	it("returns no permissions when the response carries none", async () => {
		const { octokit } = createOctokit({ token: "ghs_token" });

		await expect(getGithubInstallationPermissions(octokit)).resolves.toEqual(
			{},
		);
	});
});
