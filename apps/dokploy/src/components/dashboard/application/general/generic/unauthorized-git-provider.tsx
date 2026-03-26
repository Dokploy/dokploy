import { AlertCircle, GitBranch, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	BitbucketIcon,
	GiteaIcon,
	GithubIcon,
	GitIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { DialogAction } from "@/components/shared/dialog-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RouterOutputs } from "@/utils/api";

interface Props {
	service:
		| RouterOutputs["application"]["one"]
		| RouterOutputs["compose"]["one"];
	onDisconnect: () => void;
}

export const UnauthorizedGitProvider = ({ service, onDisconnect }: Props) => {
	const t = useTranslations("applicationGeneralProvider");
	const getProviderIcon = (sourceType: string) => {
		switch (sourceType) {
			case "github":
				return <GithubIcon className="size-5 text-muted-foreground" />;
			case "gitlab":
				return <GitlabIcon className="size-5 text-muted-foreground" />;
			case "bitbucket":
				return <BitbucketIcon className="size-5 text-muted-foreground" />;
			case "gitea":
				return <GiteaIcon className="size-5 text-muted-foreground" />;
			case "git":
				return <GitIcon className="size-5 text-muted-foreground" />;
			default:
				return <GitBranch className="size-5 text-muted-foreground" />;
		}
	};

	const getRepositoryInfo = () => {
		switch (service.sourceType) {
			case "github":
				return {
					repo: service.repository,
					branch: service.branch,
					owner: service.owner,
				};
			case "gitlab":
				return {
					repo: service.gitlabRepository,
					branch: service.gitlabBranch,
					owner: service.gitlabOwner,
				};
			case "bitbucket":
				return {
					repo: service.bitbucketRepository,
					branch: service.bitbucketBranch,
					owner: service.bitbucketOwner,
				};
			case "gitea":
				return {
					repo: service.giteaRepository,
					branch: service.giteaBranch,
					owner: service.giteaOwner,
				};
			case "git":
				return {
					repo: service.customGitUrl,
					branch: service.customGitBranch,
					owner: null,
				};
			default:
				return { repo: null, branch: null, owner: null };
		}
	};

	const { repo, branch, owner } = getRepositoryInfo();

	return (
		<div className="space-y-4">
			<Alert>
				<AlertCircle className="h-4 w-4" />
				<AlertDescription>
					{t("unauthorized.alert", { sourceType: service.sourceType })}
				</AlertDescription>
			</Alert>

			<Card className="border-dashed border-2 border-muted-foreground/20 bg-transparent">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{getProviderIcon(service.sourceType)}
						<span className="capitalize text-sm font-medium">
							{t("unauthorized.repositoryTitle", {
								sourceType: service.sourceType,
							})}
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{owner && (
						<div>
							<span className="text-sm font-medium text-muted-foreground">
								{t("unauthorized.owner")}
							</span>
							<p className="text-sm">{owner}</p>
						</div>
					)}
					{repo && (
						<div>
							<span className="text-sm font-medium text-muted-foreground">
								{t("unauthorized.repository")}
							</span>
							<p className="text-sm">{repo}</p>
						</div>
					)}
					{branch && (
						<div>
							<span className="text-sm font-medium text-muted-foreground">
								{t("unauthorized.branch")}
							</span>
							<p className="text-sm">{branch}</p>
						</div>
					)}

					<div className="pt-4 border-t">
						<DialogAction
							title={t("unauthorized.disconnectDialogTitle")}
							description={t("unauthorized.disconnectDialogDescription")}
							type="default"
							onClick={async () => {
								onDisconnect();
							}}
						>
							<Button variant="secondary" className="w-full">
								<Unlink className="size-4 mr-2" />
								{t("unauthorized.disconnectButton")}
							</Button>
						</DialogAction>
						<p className="text-xs text-muted-foreground mt-2">
							{t("unauthorized.disconnectHint")}
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
