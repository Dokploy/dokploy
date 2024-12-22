import {
	BitbucketIcon,
	GitIcon,
	GithubIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { formatDate } from "date-fns";
import Link from "next/link";
import { AddBitbucketProvider } from "./bitbucket/add-bitbucket-provider";
import { EditBitbucketProvider } from "./bitbucket/edit-bitbucket-provider";
import { AddGithubProvider } from "./github/add-github-provider";
import { EditGithubProvider } from "./github/edit-github-provider";
import { AddGitlabProvider } from "./gitlab/add-gitlab-provider";
import { EditGitlabProvider } from "./gitlab/edit-gitlab-provider";
import { RemoveGitProvider } from "./remove-git-provider";

export const ShowGitProviders = () => {
	const { data } = api.gitProvider.getAll.useQuery();

	const url = useUrl();

	const getGitlabUrl = (
		clientId: string,
		gitlabId: string,
		gitlabUrl: string,
	) => {
		const redirectUri = `${url}/api/providers/gitlab/callback?gitlabId=${gitlabId}`;

		const scope = "api read_user read_repository";

		const authUrl = `${gitlabUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;

		return authUrl;
	};
	return (
		<div className="p-6 space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-bold">Git Providers</h1>
				<p className="text-muted-foreground">
					Connect your Git provider for authentication.
				</p>
			</div>
			<Card className=" bg-transparent">
				<CardContent className="p-4">
					<div className="flex gap-4 sm:flex-row flex-col w-full">
						<AddGithubProvider />
						<AddGitlabProvider />
						<AddBitbucketProvider />
					</div>
				</CardContent>
			</Card>
			<div className="grid gap-4 sm:grid-cols-1 md:grid-cols-1">
				{data && data.length === 0 && (
					<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
						<GitIcon className="size-8" />
						<span className="text-base text-muted-foreground">
							No Git Providers found. To add a provider, create a new one such
							as GitHub, GitLab, or Bitbucket.
						</span>
					</div>
				)}
				{data?.map((gitProvider, index) => {
					const isGithub = gitProvider.providerType === "github";
					const isGitlab = gitProvider.providerType === "gitlab";
					const isBitbucket = gitProvider.providerType === "bitbucket";
					const haveGithubRequirements =
						gitProvider.providerType === "github" &&
						gitProvider.github?.githubPrivateKey &&
						gitProvider.github?.githubAppId &&
						gitProvider.github?.githubInstallationId;

					const haveGitlabRequirements =
						gitProvider.gitlab?.accessToken && gitProvider.gitlab?.refreshToken;
					return (
						<div
							className="space-y-4"
							key={`${gitProvider.gitProviderId}-${index}`}
						>
							<Card className="flex sm:flex-row max-sm:gap-2 flex-col justify-between items-center p-4 h-full bg-transparent">
								<div className="flex items-center space-x-4 w-full">
									{gitProvider.providerType === "github" && (
										<GithubIcon className="w-6 h-6" />
									)}
									{gitProvider.providerType === "gitlab" && (
										<GitlabIcon className="w-6 h-6" />
									)}
									{gitProvider.providerType === "bitbucket" && (
										<BitbucketIcon className="w-6 h-6" />
									)}
									<div className="flex flex-col gap-1">
										<p className="font-medium">
											{gitProvider.providerType === "github"
												? "GitHub"
												: gitProvider.providerType === "gitlab"
													? "GitLab"
													: "Bitbucket"}
										</p>
										<p className="text-sm text-muted-foreground">
											{gitProvider.name}
										</p>
										<span>
											<p className="text-sm text-muted-foreground">
												Created{" "}
												{formatDate(
													gitProvider.createdAt,
													"yyyy-MM-dd hh:mm:ss a",
												)}
											</p>
										</span>
									</div>
								</div>
								<div className="flex  sm:gap-4 sm:flex-row flex-col">
									{!haveGithubRequirements && isGithub && (
										<div className="flex flex-col  gap-1">
											<Link
												href={`${gitProvider?.github?.githubAppName}/installations/new?state=gh_setup:${gitProvider?.github.githubId}`}
												className={buttonVariants({ className: "w-fit" })}
											>
												Install
											</Link>
										</div>
									)}

									{haveGithubRequirements && isGithub && (
										<div className="flex flex-col  gap-1">
											<Link
												href={`${gitProvider?.github?.githubAppName}`}
												target="_blank"
												className={buttonVariants({
													className: "w-fit",
													variant: "secondary",
												})}
											>
												<span className="text-sm">Manage</span>
											</Link>
										</div>
									)}

									{!haveGitlabRequirements && isGitlab && (
										<div className="flex flex-col  gap-1">
											<Link
												href={getGitlabUrl(
													gitProvider.gitlab?.applicationId || "",
													gitProvider.gitlab?.gitlabId || "",
													gitProvider.gitlab?.gitlabUrl,
												)}
												target="_blank"
												className={buttonVariants({
													className: "w-fit",
													variant: "secondary",
												})}
											>
												<span className="text-sm">Install</span>
											</Link>
										</div>
									)}
									<div className="flex flex-row gap-1">
										{isBitbucket && (
											<EditBitbucketProvider
												bitbucketId={gitProvider.bitbucket.bitbucketId}
											/>
										)}
										{isGitlab && haveGitlabRequirements && (
											<EditGitlabProvider
												gitlabId={gitProvider.gitlab.gitlabId}
											/>
										)}
										{isGithub && haveGithubRequirements && (
											<EditGithubProvider
												githubId={gitProvider.github.githubId}
											/>
										)}
										<RemoveGitProvider
											gitProviderId={gitProvider.gitProviderId}
											gitProviderType={gitProvider.providerType}
										/>
									</div>
								</div>
							</Card>
						</div>
					);
				})}
			</div>
		</div>
	);
};
