import type { RouterOutputs } from "@/utils/api";
import type { Repository as GiteaRepository } from "@/utils/gitea-utils";

export type RepositoryVisibility = "public" | "private" | "internal";

export interface RepositoryOption {
	value: string;
	name: string;
	owner: string;
	visibility: RepositoryVisibility;
	isFork: boolean;
	isArchived: boolean;
	lastActivityAt: string | null;
}

type GithubRepository =
	RouterOutputs["github"]["getGithubRepositories"][number];
type GitlabRepository =
	RouterOutputs["gitlab"]["getGitlabRepositories"][number];
type BitbucketRepository =
	RouterOutputs["bitbucket"]["getBitbucketRepositories"][number];

export const toGithubRepositoryOption = (
	repo: GithubRepository,
): RepositoryOption => ({
	value: `${repo.owner.login}/${repo.name}`,
	name: repo.name,
	owner: repo.owner.login,
	visibility:
		repo.visibility === "internal"
			? "internal"
			: repo.private
				? "private"
				: "public",
	isFork: repo.fork,
	isArchived: repo.archived,
	lastActivityAt: repo.pushed_at,
});

export const toGitlabRepositoryOption = (
	repo: GitlabRepository,
): RepositoryOption => ({
	value: repo.url,
	name: repo.name,
	owner: repo.owner.username,
	visibility: repo.visibility,
	isFork: repo.fork,
	isArchived: repo.archived,
	lastActivityAt: repo.lastActivityAt,
});

export const toGiteaRepositoryOption = (
	repo: GiteaRepository,
): RepositoryOption => ({
	value: `${repo.owner.username}/${repo.name}`,
	name: repo.name,
	owner: repo.owner.username,
	visibility: repo.visibility,
	isFork: repo.fork,
	isArchived: repo.archived,
	lastActivityAt: repo.lastActivityAt,
});

// Bitbucket Cloud has no concept of archiving a repository.
export const toBitbucketRepositoryOption = (
	repo: BitbucketRepository,
): RepositoryOption => ({
	value: `${repo.owner.username}/${repo.name}`,
	name: repo.name,
	owner: repo.owner.username,
	visibility: repo.visibility,
	isFork: repo.fork,
	isArchived: false,
	lastActivityAt: repo.lastActivityAt,
});

export const parseRepositoryDate = (date: string | null) => {
	const parsed = date ? new Date(date) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const toTimestamp = (date: string | null) =>
	parseRepositoryDate(date)?.getTime() ?? 0;

export const groupRepositories = <T>(
	repositories: T[],
	toOption: (repository: T) => RepositoryOption,
) => {
	const entries = repositories
		.map((repository) => ({ repository, option: toOption(repository) }))
		.sort(
			(a, b) =>
				toTimestamp(b.option.lastActivityAt) -
					toTimestamp(a.option.lastActivityAt) ||
				a.option.name.localeCompare(b.option.name),
		);

	return {
		active: entries.filter((entry) => !entry.option.isArchived),
		archived: entries.filter((entry) => entry.option.isArchived),
	};
};
