import { GitBranch, LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SaveDockerProvider } from "~/components/dashboard/application/general/generic/save-docker-provider";
import { SaveGitProvider } from "~/components/dashboard/application/general/generic/save-git-provider";
import { SaveGithubProvider } from "~/components/dashboard/application/general/generic/save-github-provider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { api } from "~/utils/api";
import { SaveDragNDrop } from "./save-drag-n-drop";

type TabState = "github" | "docker" | "git" | "drop";

interface Props {
	applicationId: string;
}

export const ShowProviderForm = ({ applicationId }: Props) => {
	const { data: haveGithubConfigured } =
		api.admin.haveGithubConfigured.useQuery();

	const { data: application } = api.application.one.useQuery({ applicationId });
	const [tab, setSab] = useState<TabState>(application?.sourceType || "github");
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
					<div className="hidden space-y-1 text-sm font-normal md:block">
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
					<TabsList className="grid w-fit grid-cols-4 bg-transparent">
						<TabsTrigger
							value="github"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Github
						</TabsTrigger>
						<TabsTrigger
							value="docker"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Docker
						</TabsTrigger>
						<TabsTrigger
							value="git"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Git
						</TabsTrigger>
						<TabsTrigger
							value="drop"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Drop
						</TabsTrigger>
					</TabsList>
					<TabsContent value="github" className="w-full p-2">
						{haveGithubConfigured ? (
							<SaveGithubProvider applicationId={applicationId} />
						) : (
							<div className="flex flex-col items-center gap-3">
								<LockIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									To deploy using GitHub, you need to configure your account
									first. Please, go to{" "}
									<Link
										href="/dashboard/settings/server"
										className="text-foreground"
									>
										Settings
									</Link>{" "}
									to do so.
								</span>
							</div>
						)}
					</TabsContent>
					<TabsContent value="docker" className="w-full p-2">
						<SaveDockerProvider applicationId={applicationId} />
					</TabsContent>
					<TabsContent value="git" className="w-full p-2">
						<SaveGitProvider applicationId={applicationId} />
					</TabsContent>
					<TabsContent value="drop" className="w-full p-2">
						<SaveDragNDrop applicationId={applicationId} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
};
