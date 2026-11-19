import {
	createOpenPullRequestBasesLister,
	findStackedPullRequestTargets,
	MAX_STACKED_PULL_REQUEST_DEPTH,
} from "@dokploy/server/utils/providers/github-stacked-pull-requests";
import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";

const listerFor = (pullRequests: Array<{ head: string; base: string }>) =>
	vi.fn(async (headBranch: string) =>
		pullRequests
			.filter((pullRequest) => pullRequest.head === headBranch)
			.map((pullRequest) => pullRequest.base),
	);

const linearStack = (length: number) =>
	Array.from({ length }, (_, index) => ({
		head: `branch-${index + 1}`,
		base: index === 0 ? "main" : `branch-${index}`,
	}));

describe("findStackedPullRequestTargets", () => {
	it("reaches the application branch through a stack of pull requests", async () => {
		const listOpenPullRequestBases = listerFor([
			{ head: "inbox-list", base: "foundation" },
			{ head: "foundation", base: "main" },
		]);

		const reached = await findStackedPullRequestTargets({
			baseBranch: "inbox-list",
			targetBranches: ["main"],
			listOpenPullRequestBases,
		});

		expect(reached).toEqual(new Set(["main"]));
		expect(listOpenPullRequestBases).toHaveBeenCalledTimes(2);
	});

	it("returns nothing when the base branch is not part of a stack", async () => {
		const reached = await findStackedPullRequestTargets({
			baseBranch: "release",
			targetBranches: ["main"],
			listOpenPullRequestBases: listerFor([]),
		});

		expect(reached.size).toBe(0);
	});

	it("stops on cycles", async () => {
		const listOpenPullRequestBases = listerFor([
			{ head: "a", base: "b" },
			{ head: "b", base: "a" },
		]);

		const reached = await findStackedPullRequestTargets({
			baseBranch: "a",
			targetBranches: ["main"],
			listOpenPullRequestBases,
		});

		expect(reached.size).toBe(0);
		expect(listOpenPullRequestBases).toHaveBeenCalledTimes(2);
	});

	it("follows at most the maximum number of links", async () => {
		const stack = linearStack(MAX_STACKED_PULL_REQUEST_DEPTH);
		const top = stack[stack.length - 1]?.head as string;

		const withinLimit = await findStackedPullRequestTargets({
			baseBranch: top,
			targetBranches: ["main"],
			listOpenPullRequestBases: listerFor(stack),
		});
		expect(withinLimit).toEqual(new Set(["main"]));

		const tooDeep = linearStack(MAX_STACKED_PULL_REQUEST_DEPTH + 1);
		const listOpenPullRequestBases = listerFor(tooDeep);
		const beyondLimit = await findStackedPullRequestTargets({
			baseBranch: tooDeep[tooDeep.length - 1]?.head as string,
			targetBranches: ["main"],
			listOpenPullRequestBases,
		});
		expect(beyondLimit.size).toBe(0);
		expect(listOpenPullRequestBases).toHaveBeenCalledTimes(
			MAX_STACKED_PULL_REQUEST_DEPTH,
		);
	});

	it("follows every open pull request opened from the same head", async () => {
		const reached = await findStackedPullRequestTargets({
			baseBranch: "feature",
			targetBranches: ["main", "develop"],
			listOpenPullRequestBases: listerFor([
				{ head: "feature", base: "develop" },
				{ head: "feature", base: "main" },
			]),
		});

		expect(reached).toEqual(new Set(["main", "develop"]));
	});
});

describe("createOpenPullRequestBasesLister", () => {
	it("lists open pull requests of the repository by head branch", async () => {
		const list = vi.fn().mockResolvedValue({
			data: [{ base: { ref: "main" } }],
		});
		const octokit = { rest: { pulls: { list } } } as unknown as Octokit;

		const bases = await createOpenPullRequestBasesLister(
			octokit,
			"agentHits",
			"dokploy",
		)("feature");

		expect(bases).toEqual(["main"]);
		expect(list).toHaveBeenCalledWith({
			owner: "agentHits",
			repo: "dokploy",
			state: "open",
			head: "agentHits:feature",
			per_page: 100,
		});
	});
});
