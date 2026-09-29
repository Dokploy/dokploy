import type { RouterInputs } from "@/utils/api";

type ComposeProviderUpdate = Omit<
	RouterInputs["compose"]["update"],
	"composeStatus"
>;

interface RepositoryProviderInput {
	branch: string;
	composePath: string;
	repository: {
		owner: string;
		repo: string;
	};
	watchPaths?: string[];
	enableSubmodules: boolean;
}

interface GithubProviderInput extends RepositoryProviderInput {
	githubId: string;
	triggerType: "push" | "tag";
}

export const buildGithubProviderUpdate = (
	composeId: string,
	data: GithubProviderInput,
): ComposeProviderUpdate => ({
	branch: data.branch,
	repository: data.repository.repo,
	composeId,
	owner: data.repository.owner,
	composePath: data.composePath,
	githubId: data.githubId,
	sourceType: "github",
	watchPaths: data.watchPaths,
	enableSubmodules: data.enableSubmodules,
	triggerType: data.triggerType,
});

interface GitlabProviderInput extends RepositoryProviderInput {
	gitlabId: string;
	repository: RepositoryProviderInput["repository"] & {
		id: number | null;
		gitlabPathNamespace: string;
	};
}

export const buildGitlabProviderUpdate = (
	composeId: string,
	data: GitlabProviderInput,
): ComposeProviderUpdate => ({
	gitlabBranch: data.branch,
	gitlabRepository: data.repository.repo,
	gitlabOwner: data.repository.owner,
	composePath: data.composePath,
	gitlabId: data.gitlabId,
	composeId,
	gitlabProjectId: data.repository.id,
	gitlabPathNamespace: data.repository.gitlabPathNamespace,
	sourceType: "gitlab",
	watchPaths: data.watchPaths,
	enableSubmodules: data.enableSubmodules,
});

interface BitbucketProviderInput extends RepositoryProviderInput {
	bitbucketId: string;
	repository: RepositoryProviderInput["repository"] & {
		slug?: string;
	};
}

export const buildBitbucketProviderUpdate = (
	composeId: string,
	data: BitbucketProviderInput,
): ComposeProviderUpdate => ({
	bitbucketBranch: data.branch,
	bitbucketRepository: data.repository.repo,
	bitbucketRepositorySlug: data.repository.slug || data.repository.repo,
	bitbucketOwner: data.repository.owner,
	bitbucketId: data.bitbucketId,
	composePath: data.composePath,
	composeId,
	sourceType: "bitbucket",
	watchPaths: data.watchPaths,
	enableSubmodules: data.enableSubmodules,
});

interface GiteaProviderInput extends RepositoryProviderInput {
	giteaId: string;
}

export const buildGiteaProviderUpdate = (
	composeId: string,
	data: GiteaProviderInput,
): ComposeProviderUpdate => ({
	giteaBranch: data.branch,
	giteaRepository: data.repository.repo,
	giteaOwner: data.repository.owner,
	composePath: data.composePath,
	giteaId: data.giteaId,
	composeId,
	sourceType: "gitea",
	watchPaths: data.watchPaths,
	enableSubmodules: data.enableSubmodules,
});

interface GitProviderInput {
	branch: string;
	repositoryURL: string;
	sshKey?: string;
	composePath: string;
	watchPaths?: string[];
	enableSubmodules: boolean;
}

export const buildGitProviderUpdate = (
	composeId: string,
	data: GitProviderInput,
): ComposeProviderUpdate => ({
	customGitBranch: data.branch,
	customGitUrl: data.repositoryURL,
	customGitSSHKeyId: data.sshKey === "none" ? null : data.sshKey,
	composeId,
	sourceType: "git",
	composePath: data.composePath,
	watchPaths: data.watchPaths || [],
	enableSubmodules: data.enableSubmodules,
});
