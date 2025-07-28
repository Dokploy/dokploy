import { describe, expect, it } from "vitest";
import { extractCommitMessage } from "@/pages/api/deploy/[refreshToken]";

describe("GitHub Webhook Skip CI", () => {
	const mockGithubHeaders = {
		"x-github-event": "push",
	};

	const createMockBody = (message: string) => ({
		head_commit: {
			message,
		},
	});

	const skipKeywords = [
		"[skip ci]",
		"[ci skip]",
		"[no ci]",
		"[skip actions]",
		"[actions skip]",
	];

	it("should detect skip keywords in commit message", () => {
		for (const keyword of skipKeywords) {
			const message = `feat: add new feature ${keyword}`;
			const commitMessage = extractCommitMessage(
				mockGithubHeaders,
				createMockBody(message),
			);
			expect(commitMessage.includes(keyword)).toBe(true);
		}
	});

	it("should not detect skip keywords in normal commit message", () => {
		const message = "feat: add new feature";
		const commitMessage = extractCommitMessage(
			mockGithubHeaders,
			createMockBody(message),
		);
		for (const keyword of skipKeywords) {
			expect(commitMessage.includes(keyword)).toBe(false);
		}
	});

	it("should handle different webhook sources", () => {
		// GitHub
		expect(
			extractCommitMessage(
				{ "x-github-event": "push" },
				{ head_commit: { message: "[skip ci] test" } },
			),
		).toBe("[skip ci] test");

		// GitLab
		expect(
			extractCommitMessage(
				{ "x-gitlab-event": "push" },
				{ commits: [{ message: "[skip ci] test" }] },
			),
		).toBe("[skip ci] test");

		// Bitbucket
		expect(
			extractCommitMessage(
				{ "x-event-key": "repo:push" },
				{
					push: {
						changes: [{ new: { target: { message: "[skip ci] test" } } }],
					},
				},
			),
		).toBe("[skip ci] test");

		// Gitea
		expect(
			extractCommitMessage(
				{ "x-gitea-event": "push" },
				{ commits: [{ message: "[skip ci] test" }] },
			),
		).toBe("[skip ci] test");
	});

	it("should handle missing commit message", () => {
		expect(extractCommitMessage(mockGithubHeaders, {})).toBe("NEW COMMIT");
		expect(extractCommitMessage({ "x-gitlab-event": "push" }, {})).toBe(
			"NEW COMMIT",
		);
		expect(
			extractCommitMessage(
				{ "x-event-key": "repo:push" },
				{ push: { changes: [] } },
			),
		).toBe("NEW COMMIT");
		expect(extractCommitMessage({ "x-gitea-event": "push" }, {})).toBe(
			"NEW COMMIT",
		);
	});
});
