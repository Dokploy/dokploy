import {
	BitbucketIcon,
	GitIcon,
	GithubIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { CodeIcon, GitBranch, LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeFileEditor } from "../compose-file-editor";
import { ShowConvertedCompose } from "../show-converted-compose";
import { SaveBitbucketProviderCompose } from "./save-bitbucket-provider-compose";
import { SaveGitProviderCompose } from "./save-git-provider-compose";
import { SaveGithubProviderCompose } from "./save-github-provider-compose";
import { SaveGitlabProviderCompose } from "./save-gitlab-provider-compose";

type TabState = "github" | "git" | "raw" | "gitlab" | "bitbucket";
interface Props {
	composeId: string;
}

export const ShowProviderFormCompose = ({ composeId }: Props) => {
	const { data: githubProviders } = api.github.githubProviders.useQuery();
	const { data: gitlabProviders } = api.gitlab.gitlabProviders.useQuery();
	const { data: bitbucketProviders } =
		api.bitbucket.bitbucketProviders.useQuery();

	const { data: compose } = api.compose.one.useQuery({ composeId });
	const [tab, setSab] = useState<TabState>(compose?.sourceType || "github");
	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">Provider</span>
						<p className="flex items-center font-normal text-muted-foreground text-sm">
							Select the source of your code
						</p>
					</div>
					<div className="hidden flex-row items-center gap-2 space-y-1 font-normal text-sm md:flex">
						<ShowConvertedCompose composeId={composeId} />
						<GitBranch className="size-6 text-muted-foreground" />
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Tabs
					value={tab}
					className="w-full"
					onValueChange={(e) => {
						setSab(e as TabState);
					}}
				>
					<div className="flex w-full flex-row items-center justify-between gap-4">
						<TabsList className="justify-start overflow-y-hidden bg-transparent max-md:overflow-x-scroll md:grid md:w-fit md:grid-cols-5">
							<TabsTrigger
								value="github"
								className="gap-2 rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GithubIcon className="size-4 fill-current text-current" />
								Github
							</TabsTrigger>
							<TabsTrigger
								value="gitlab"
								className="gap-2 rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitlabIcon className="size-4 fill-current text-current" />
								Gitlab
							</TabsTrigger>
							<TabsTrigger
								value="bitbucket"
								className="gap-2 rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<BitbucketIcon className="size-4 fill-current text-current" />
								Bitbucket
							</TabsTrigger>

							<TabsTrigger
								value="git"
								className="gap-2 rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitIcon />
								Git
							</TabsTrigger>
							<TabsTrigger
								value="raw"
								className="gap-2 rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<CodeIcon className="size-4 " />
								Raw
							</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="github" className="w-full p-2">
						{githubProviders && githubProviders?.length > 0 ? (
							<SaveGithubProviderCompose composeId={composeId} />
						) : (
							<div className="flex min-h-[15vh] flex-col items-center justify-center gap-3">
								<GithubIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									To deploy using GitHub, you need to configure your account
									first. Please, go to{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground"
									>
										Settings
									</Link>{" "}
									to do so.
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="gitlab" className="w-full p-2">
						{gitlabProviders && gitlabProviders?.length > 0 ? (
							<SaveGitlabProviderCompose composeId={composeId} />
						) : (
							<div className="flex min-h-[15vh] flex-col items-center justify-center gap-3">
								<GitlabIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									To deploy using GitLab, you need to configure your account
									first. Please, go to{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground"
									>
										Settings
									</Link>{" "}
									to do so.
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="bitbucket" className="w-full p-2">
						{bitbucketProviders && bitbucketProviders?.length > 0 ? (
							<SaveBitbucketProviderCompose composeId={composeId} />
						) : (
							<div className="flex min-h-[15vh] flex-col items-center justify-center gap-3">
								<BitbucketIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									To deploy using Bitbucket, you need to configure your account
									first. Please, go to{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground"
									>
										Settings
									</Link>{" "}
									to do so.
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="git" className="w-full p-2">
						<SaveGitProviderCompose composeId={composeId} />
					</TabsContent>

					<TabsContent value="raw" className="flex w-full flex-col gap-4 p-2">
						<ComposeFileEditor composeId={composeId} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
};
