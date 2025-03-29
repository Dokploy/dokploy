import {
	BitbucketIcon,
	GitIcon,
	GiteaIcon,
	GithubIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { CodeIcon, GitBranch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeFileEditor } from "../compose-file-editor";
import { ShowConvertedCompose } from "../show-converted-compose";
import { SaveBitbucketProviderCompose } from "./save-bitbucket-provider-compose";
import { SaveGitProviderCompose } from "./save-git-provider-compose";
import { SaveGiteaProviderCompose } from "./save-gitea-provider-compose";
import { SaveGithubProviderCompose } from "./save-github-provider-compose";
import { SaveGitlabProviderCompose } from "./save-gitlab-provider-compose";

type TabState = "github" | "git" | "raw" | "gitlab" | "bitbucket" | "gitea"; // Adding gitea to the TabState
interface Props {
	composeId: string;
}

export const ShowProviderFormCompose = ({ composeId }: Props) => {
	const { data: githubProviders } = api.github.githubProviders.useQuery();
	const { data: gitlabProviders } = api.gitlab.gitlabProviders.useQuery();
	const { data: bitbucketProviders } =
		api.bitbucket.bitbucketProviders.useQuery();
	const { data: giteaProviders } = api.gitea.giteaProviders.useQuery(); // Fetching Gitea providers

	const { data: compose } = api.compose.one.useQuery({ composeId });
	const [tab, setSab] = useState<TabState>(compose?.sourceType || "github");

	// Ensure we fall back to empty arrays if the data is undefined
	const safeGithubProviders = githubProviders || [];
	const safeGitlabProviders = gitlabProviders || [];
	const safeBitbucketProviders = bitbucketProviders || [];
	const safeGiteaProviders = giteaProviders || [];

	const renderProviderContent = (
		providers: any[],
		providerType: string,
		ProviderComponent: React.ComponentType<any>,
	) => {
		if (providers.length > 0) {
			return <ProviderComponent composeId={composeId} />;
		}

		return (
			<div className="flex flex-col items-center gap-3 min-h-[15vh] justify-center">
				{providerType === "github" && (
					<GithubIcon className="size-8 text-muted-foreground" />
				)}
				{providerType === "gitlab" && (
					<GitlabIcon className="size-8 text-muted-foreground" />
				)}
				{providerType === "bitbucket" && (
					<BitbucketIcon className="size-8 text-muted-foreground" />
				)}
				{providerType === "gitea" && (
					<GiteaIcon className="size-8 text-muted-foreground" />
				)}
				<span className="text-base text-muted-foreground">
					To deploy using{" "}
					{providerType.charAt(0).toUpperCase() + providerType.slice(1)}, you
					need to configure your account first. Please, go to{" "}
					<Link
						href="/dashboard/settings/git-providers"
						className="text-foreground"
					>
						Settings
					</Link>{" "}
					to do so.
				</span>
			</div>
		);
	};

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">Provider</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							Select the source of your code
						</p>
					</div>
					<div className="hidden space-y-1 text-sm font-normal md:flex flex-row items-center gap-2">
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
					<div className="flex flex-row items-center justify-between w-full gap-4">
						<TabsList className="md:grid md:w-fit md:grid-cols-6 max-md:overflow-x-scroll justify-start bg-transparent overflow-y-hidden">
							<TabsTrigger
								value="github"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GithubIcon className="size-4 text-current fill-current" />
								GitHub
							</TabsTrigger>
							<TabsTrigger
								value="gitlab"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitlabIcon className="size-4 text-current fill-current" />
								GitLab
							</TabsTrigger>
							<TabsTrigger
								value="bitbucket"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<BitbucketIcon className="size-4 text-current fill-current" />
								Bitbucket
							</TabsTrigger>
							<TabsTrigger
								value="gitea" // Added Gitea tab
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GiteaIcon className="size-4 text-current fill-current" /> Gitea
							</TabsTrigger>
							<TabsTrigger
								value="git"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitIcon />
								Git
							</TabsTrigger>
							<TabsTrigger
								value="raw"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<CodeIcon className="size-4" />
								Raw
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="github" className="w-full p-2">
						{renderProviderContent(
							safeGithubProviders,
							"github",
							SaveGithubProviderCompose,
						)}
					</TabsContent>
					<TabsContent value="gitea" className="w-full p-2">
						{renderProviderContent(
							safeGiteaProviders,
							"gitea",
							SaveGiteaProviderCompose,
						)}
					</TabsContent>
					<TabsContent value="gitlab" className="w-full p-2">
						{renderProviderContent(
							safeGitlabProviders,
							"gitlab",
							SaveGitlabProviderCompose,
						)}
					</TabsContent>
					<TabsContent value="bitbucket" className="w-full p-2">
						{renderProviderContent(
							safeBitbucketProviders,
							"bitbucket",
							SaveBitbucketProviderCompose,
						)}
					</TabsContent>
					<TabsContent value="git" className="w-full p-2">
						<SaveGitProviderCompose composeId={composeId} />
					</TabsContent>

					<TabsContent value="raw" className="w-full p-2 flex flex-col gap-4">
						<ComposeFileEditor composeId={composeId} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
};
