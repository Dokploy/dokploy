import type { Octokit } from "octokit";

export const MAX_STACKED_PULL_REQUEST_DEPTH = 10;

export type ListOpenPullRequestBases = (
	headBranch: string,
) => Promise<string[]>;

export const createOpenPullRequestBasesLister = (
	octokit: Octokit,
	owner: string,
	repository: string,
): ListOpenPullRequestBases => {
	return async (headBranch) => {
		const { data } = await octokit.rest.pulls.list({
			owner,
			repo: repository,
			state: "open",
			// The owner prefix limits matches to branches of this repository,
			// so pull requests opened from forks never become links of a stack.
			head: `${owner}:${headBranch}`,
			per_page: 100,
		});
		return data.map((pullRequest) => pullRequest.base.ref);
	};
};

/**
 * Walks a stack of pull requests downwards: from `baseBranch` it follows the
 * open pull request whose head is that branch to its own base, and so on.
 * Returns the target branches reached within `maxDepth` links.
 */
export const findStackedPullRequestTargets = async ({
	baseBranch,
	targetBranches,
	listOpenPullRequestBases,
	maxDepth = MAX_STACKED_PULL_REQUEST_DEPTH,
}: {
	baseBranch: string;
	targetBranches: Iterable<string>;
	listOpenPullRequestBases: ListOpenPullRequestBases;
	maxDepth?: number;
}): Promise<Set<string>> => {
	const targets = new Set(targetBranches);
	const reached = new Set<string>();
	const visited = new Set<string>([baseBranch]);
	let frontier = [baseBranch];

	for (
		let depth = 0;
		depth < maxDepth && frontier.length > 0 && reached.size < targets.size;
		depth++
	) {
		const nextFrontier: string[] = [];
		for (const headBranch of frontier) {
			for (const base of await listOpenPullRequestBases(headBranch)) {
				if (visited.has(base)) continue;
				visited.add(base);
				if (targets.has(base)) reached.add(base);
				nextFrontier.push(base);
			}
		}
		frontier = nextFrontier;
	}

	return reached;
};
