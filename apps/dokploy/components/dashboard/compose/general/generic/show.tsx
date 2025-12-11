import { CodeIcon, GitBranch, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { UnauthorizedGitProvider } from "@/components/dashboard/application/general/generic/unauthorized-git-provider";
import {
	BitbucketIcon,
	GiteaIcon,
	GithubIcon,
	GitIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { ComposeFileEditor } from "../compose-file-editor";
import { ShowConvertedCompose } from "../show-converted-compose";
import { SaveBitbucketProviderCompose } from "./save-bitbucket-provider-compose";
import { SaveGitProviderCompose } from "./save-git-provider-compose";
import { SaveGiteaProviderCompose } from "./save-gitea-provider-compose";
import { SaveGithubProviderCompose } from "./save-github-provider-compose";
import { SaveGitlabProviderCompose } from "./save-gitlab-provider-compose";

type TabState = "github" | "git" | "raw" | "gitlab" | "bitbucket" | "gitea";
interface Props {
	composeId: string;
}

export const ShowProviderFormCompose = ({ composeId }: Props) => {
	const { t } = useTranslation("common");
	const { data: githubProviders, isLoading: isLoadingGithub } =
		api.github.githubProviders.useQuery();
	const { data: gitlabProviders, isLoading: isLoadingGitlab } =
		api.gitlab.gitlabProviders.useQuery();
	const { data: bitbucketProviders, isLoading: isLoadingBitbucket } =
		api.bitbucket.bitbucketProviders.useQuery();
	const { data: giteaProviders, isLoading: isLoadingGitea } =
		api.gitea.giteaProviders.useQuery();

	const { mutateAsync: disconnectGitProvider } =
		api.compose.disconnectGitProvider.useMutation();

	const { data: compose, refetch } = api.compose.one.useQuery({ composeId });
	const [tab, setSab] = useState<TabState>(compose?.sourceType || "github");

	const isLoading =
		isLoadingGithub || isLoadingGitlab || isLoadingBitbucket || isLoadingGitea;

	const handleDisconnect = async () => {
		try {
			await disconnectGitProvider({ composeId });
			toast.success(t("application.git.main.toast.disconnectSuccess"));
			await refetch();
		} catch (error) {
			toast.error(
				`${t("application.git.main.toast.disconnectErrorPrefix")}: ${
					error instanceof Error ? error.message : t("common.unknownError")
				}`,
			);
		}
	};

	if (isLoading) {
		return (
			<Card className="group relative w-full bg-transparent">
				<CardHeader>
					<CardTitle className="flex items-start justify-between">
						<div className="flex flex-col gap-2">
							<span className="flex flex-col space-y-0.5">
								{t("application.git.main.cardTitle")}
							</span>
							<p className="flex items-center text-sm font-normal text-muted-foreground">
								{t("application.git.main.cardDescription")}
							</p>
						</div>
						<div className="hidden space-y-1 text-sm font-normal md:block">
							<GitBranch className="size-6 text-muted-foreground" />
						</div>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex min-h-[25vh] items-center justify-center">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							<span>{t("application.git.main.loadingProviders")}</span>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	// Check if user doesn't have access to the current git provider
	if (
		compose &&
		!compose.hasGitProviderAccess &&
		compose.sourceType !== "raw"
	) {
		return (
			<Card className="group relative w-full bg-transparent">
				<CardHeader>
					<CardTitle className="flex items-start justify-between">
						<div className="flex flex-col gap-2">
							<span className="flex flex-col space-y-0.5">
								{t("application.git.main.cardTitle")}
							</span>
							<p className="flex items-center text-sm font-normal text-muted-foreground">
								{t("application.git.main.unauthorizedDescription")}
							</p>
						</div>
						<div className="hidden space-y-1 text-sm font-normal md:block">
							<GitBranch className="size-6 text-muted-foreground" />
						</div>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<UnauthorizedGitProvider
						service={compose}
						onDisconnect={handleDisconnect}
					/>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="group relative w-full bg-transparent">
			<CardHeader>
				<CardTitle className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<span className="flex flex-col space-y-0.5">
							{t("application.git.main.cardTitle")}
						</span>
						<p className="flex items-center text-sm font-normal text-muted-foreground">
							{t("application.git.main.cardDescription")}
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
					<div className="flex flex-row items-center justify-between w-full overflow-auto">
						<TabsList className="flex gap-4 justify-start bg-transparent">
							<TabsTrigger
								value="github"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GithubIcon className="size-4 text-current fill-current" />
								{t("application.git.main.tabs.github")}
							</TabsTrigger>
							<TabsTrigger
								value="gitlab"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitlabIcon className="size-4 text-current fill-current" />
								{t("application.git.main.tabs.gitlab")}
							</TabsTrigger>
							<TabsTrigger
								value="bitbucket"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<BitbucketIcon className="size-4 text-current fill-current" />
								{t("application.git.main.tabs.bitbucket")}
							</TabsTrigger>
							<TabsTrigger
								value="gitea"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GiteaIcon className="size-4 text-current fill-current" /> Gitea
								{t("application.git.main.tabs.gitea")}
							</TabsTrigger>
							<TabsTrigger
								value="git"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<GitIcon />
								{t("application.git.main.tabs.git")}
							</TabsTrigger>
							<TabsTrigger
								value="raw"
								className="rounded-none border-b-2 gap-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
							>
								<CodeIcon className="size-4" />
								{t("compose.git.main.tabs.raw")}
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="github" className="w-full p-2">
						{githubProviders && githubProviders?.length > 0 ? (
							<SaveGithubProviderCompose composeId={composeId} />
						) : (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<GithubIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									{t("application.git.github.empty.description", {
										settingsLink: t("application.git.main.settingsLink"),
									})}{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground underline"
									>
										{t("application.git.main.settingsLink")}
									</Link>
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="gitlab" className="w-full p-2">
						{gitlabProviders && gitlabProviders?.length > 0 ? (
							<SaveGitlabProviderCompose composeId={composeId} />
						) : (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<GitlabIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									{t("application.git.gitlab.empty.description", {
										settingsLink: t("application.git.main.settingsLink"),
									})}{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground underline"
									>
										{t("application.git.main.settingsLink")}
									</Link>
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="bitbucket" className="w-full p-2">
						{bitbucketProviders && bitbucketProviders?.length > 0 ? (
							<SaveBitbucketProviderCompose composeId={composeId} />
						) : (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<BitbucketIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									{t("application.git.bitbucket.empty.description", {
										settingsLink: t("application.git.main.settingsLink"),
									})}{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground underline"
									>
										{t("application.git.main.settingsLink")}
									</Link>
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="gitea" className="w-full p-2">
						{giteaProviders && giteaProviders?.length > 0 ? (
							<SaveGiteaProviderCompose composeId={composeId} />
						) : (
							<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
								<GiteaIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									{t("application.git.gitea.empty.description", {
										settingsLink: t("application.git.main.settingsLink"),
									})}{" "}
									<Link
										href="/dashboard/settings/git-providers"
										className="text-foreground underline"
									>
										{t("application.git.main.settingsLink")}
									</Link>
								</span>
							</div>
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
