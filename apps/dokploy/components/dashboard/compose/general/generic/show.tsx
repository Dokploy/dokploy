import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";
import { GitBranch, LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeFileEditor } from "../compose-file-editor";
import { ShowConvertedCompose } from "../show-converted-compose";
import { SaveGitProviderCompose } from "./save-git-provider-compose";
import { SaveGithubProviderCompose } from "./save-github-provider-compose";

type TabState = "github" | "git" | "raw";
interface Props {
	composeId: string;
}

export const ShowProviderFormCompose = ({ composeId }: Props) => {
	const { data: haveGithubConfigured } =
		api.admin.haveGithubConfigured.useQuery();

	const { data: compose } = api.compose.one.useQuery({ composeId });
	const [tab, setSab] = useState<TabState>(compose?.sourceType || "github");
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
					<TabsList className="grid w-fit grid-cols-4 bg-transparent">
						<TabsTrigger
							value="github"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Github
						</TabsTrigger>

						<TabsTrigger
							value="git"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Git
						</TabsTrigger>
						<TabsTrigger
							value="raw"
							className="rounded-none border-b-2 border-b-transparent data-[state=active]:border-b-2 data-[state=active]:border-b-border"
						>
							Raw
						</TabsTrigger>
					</TabsList>
					<TabsContent value="github" className="w-full p-2">
						{haveGithubConfigured ? (
							<SaveGithubProviderCompose composeId={composeId} />
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
