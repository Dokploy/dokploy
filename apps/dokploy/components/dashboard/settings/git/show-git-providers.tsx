import {
	BitbucketIcon,
	GithubIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { formatDate } from "date-fns";
import { AddBitbucketProvider } from "./bitbucket/add-bitbucket-provider";
import { EditBitbucketProvider } from "./bitbucket/edit-bitbucket-provider";
import { AddGithubProvider } from "./github/add-github-provider";
import { EditGithubProvider } from "./github/edit-github-provider";
import { AddGitlabProvider } from "./gitlab/add-gitlab-provider";
import { EditGitlabProvider } from "./gitlab/edit-gitlab-provider";
import { DialogAction } from "@/components/shared/dialog-action";
import { Loader2, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";

export const ShowGitProviders = () => {
	const { data, isLoading, refetch } = api.gitProvider.getAll.useQuery();
	const { mutateAsync, isLoading: isRemoving } =
		api.gitProvider.remove.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<GitBranch className="size-6 text-muted-foreground self-center" />
							Git Providers
						</CardTitle>
						<CardDescription>
							Connect your Git provider for authentication.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
										<GitBranch className="size-8 self-center text-muted-foreground" />
										<span className="text-base text-muted-foreground text-center">
											Create your first Git Provider
										</span>
										<div>
											<div className="flex items-center bg-sidebar p-1 w-full rounded-lg">
												<div className="flex items-center gap-4 p-3.5 rounded-lg bg-background border  w-full">
													<AddGithubProvider />
													<AddGitlabProvider />
													<AddBitbucketProvider />
												</div>
											</div>
										</div>
									</div>
								) : (
									<div className="flex flex-col gap-4  min-h-[25vh]">
										<div className="flex flex-col gap-2 rounded-lg ">
											<span className="text-base font-medium">
												Available Providers
											</span>
											<div className="flex items-center bg-sidebar p-1 w-full rounded-lg">
												<div className="flex items-center gap-4 p-3.5 rounded-lg bg-background border  w-full">
													<AddGithubProvider />
													<AddGitlabProvider />
													<AddBitbucketProvider />
												</div>
											</div>
										</div>

										<div className="flex flex-col gap-4 rounded-lg ">
											{data?.map((gitProvider, index) => {
												const isGithub = gitProvider.providerType === "github";
												const isGitlab = gitProvider.providerType === "gitlab";
												const isBitbucket =
													gitProvider.providerType === "bitbucket";
												const haveGithubRequirements =
													gitProvider.providerType === "github" &&
													gitProvider.github?.githubPrivateKey &&
													gitProvider.github?.githubAppId &&
													gitProvider.github?.githubInstallationId;

												const haveGitlabRequirements =
													gitProvider.gitlab?.accessToken &&
													gitProvider.gitlab?.refreshToken;

												return (
													<div
														key={gitProvider.gitProviderId}
														className="flex items-center justify-between bg-sidebar p-1 w-full rounded-lg"
													>
														<div className="flex items-center justify-between  p-3.5 rounded-lg bg-background border  w-full">
															<div className="flex flex-col items-center justify-between">
																<div className="flex gap-2 flex-row items-center">
																	{gitProvider.providerType === "github" && (
																		<GithubIcon className="size-5" />
																	)}
																	{gitProvider.providerType === "gitlab" && (
																		<GitlabIcon className="size-5" />
																	)}
																	{gitProvider.providerType === "bitbucket" && (
																		<BitbucketIcon className="size-5" />
																	)}
																	<div className="flex flex-col gap-1">
																		<span className="text-sm font-medium">
																			{gitProvider.name}
																		</span>
																		<span className="text-xs text-muted-foreground">
																			{formatDate(
																				gitProvider.createdAt,
																				"yyyy-MM-dd hh:mm:ss a",
																			)}
																		</span>
																	</div>
																</div>
															</div>

															<div className="flex flex-row gap-1">
																{isGithub && haveGithubRequirements && (
																	<EditGithubProvider
																		githubId={gitProvider.github.githubId}
																	/>
																)}

																{isGitlab && (
																	<EditGitlabProvider
																		gitlabId={gitProvider.gitlab.gitlabId}
																	/>
																)}

																{isBitbucket && (
																	<EditBitbucketProvider
																		bitbucketId={
																			gitProvider.bitbucket.bitbucketId
																		}
																	/>
																)}

																<DialogAction
																	title="Delete Git Provider"
																	description="Are you sure you want to delete this Git Provider?"
																	type="destructive"
																	onClick={async () => {
																		await mutateAsync({
																			gitProviderId: gitProvider.gitProviderId,
																		})
																			.then(() => {
																				toast.success(
																					"Git Provider deleted successfully",
																				);
																				refetch();
																			})
																			.catch(() => {
																				toast.error(
																					"Error deleting Git Provider",
																				);
																			});
																	}}
																>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="group hover:bg-red-500/10 "
																		isLoading={isRemoving}
																	>
																		<Trash2 className="size-4 text-primary group-hover:text-red-500" />
																	</Button>
																</DialogAction>
															</div>
														</div>
													</div>
												);
											})}
										</div>

										<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
											{/* <AddCertificate /> */}
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
