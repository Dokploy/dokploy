import {
	ExternalLink,
	FileText,
	GitPullRequest,
	Loader2,
	PenSquare,
	RocketIcon,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { ShowDeploymentsModal } from "../deployments/show-deployments-modal";
import { AddPreviewDomain } from "./add-preview-domain";
import { ShowPreviewSettings } from "./show-preview-settings";

interface Props {
	applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery({ applicationId });

	const { mutateAsync: deletePreviewDeployment, isLoading } =
		api.previewDeployment.delete.useMutation();

	const {
		data: previewDeployments,
		refetch: refetchPreviewDeployments,
		isLoading: isLoadingPreviewDeployments,
	} = api.previewDeployment.all.useQuery(
		{ applicationId },
		{
			enabled: !!applicationId,
		},
	);

	const handleDeletePreviewDeployment = async (previewDeploymentId: string) => {
		deletePreviewDeployment({
			previewDeploymentId: previewDeploymentId,
		})
			.then(() => {
				refetchPreviewDeployments();
				toast.success("Preview deployment deleted");
			})
			.catch((error) => {
				toast.error(error.message);
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Preview Deployments</CardTitle>
					<CardDescription>See all the preview deployments</CardDescription>
				</div>
				{data?.isPreviewDeploymentsActive && (
					<ShowPreviewSettings applicationId={applicationId} />
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.isPreviewDeploymentsActive ? (
					<>
						<div className="flex flex-col gap-2 text-sm">
							<span>
								Preview deployments are a way to test your application before it
								is deployed to production. It will create a new deployment for
								each pull request you create.
							</span>
						</div>
						{isLoadingPreviewDeployments ? (
							<div className="flex w-full flex-row items-center justify-center gap-3 min-h-[35vh]">
								<Loader2 className="size-5 text-muted-foreground animate-spin" />
								<span className="text-base text-muted-foreground">
									Loading preview deployments...
								</span>
							</div>
						) : !previewDeployments?.length ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 min-h-[35vh]">
								<RocketIcon className="size-8 text-muted-foreground" />
								<span className="text-base text-muted-foreground">
									No preview deployments found
								</span>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{previewDeployments?.map((deployment) => {
									const deploymentUrl = `${deployment.domain?.https ? "https" : "http"}://${deployment.domain?.host}${deployment.domain?.path || "/"}`;
									const status = deployment.previewStatus;
									return (
										<div
											key={deployment.previewDeploymentId}
											className="group relative overflow-hidden border rounded-lg transition-colors"
										>
											<div
												className={`absolute left-0 top-0 w-1 h-full ${
													status === "done"
														? "bg-green-500"
														: status === "running"
															? "bg-yellow-500"
															: "bg-red-500"
												}`}
											/>

											<div className="p-4">
												<div className="flex items-start justify-between mb-3">
													<div className="flex items-start gap-3">
														<GitPullRequest className="size-5 text-muted-foreground mt-1 flex-shrink-0" />
														<div>
															<div className="font-medium text-sm">
																{deployment.pullRequestTitle}
															</div>
															<div className="text-sm text-muted-foreground mt-1">
																{deployment.branch}
															</div>
														</div>
													</div>
													<Badge variant="outline" className="gap-2">
														<StatusTooltip
															status={deployment.previewStatus}
															className="size-2"
														/>
														<DateTooltip date={deployment.createdAt} />
													</Badge>
												</div>

												<div className="pl-8 space-y-3">
													<div className="relative flex-grow">
														<Input
															value={deploymentUrl}
															readOnly
															className="pr-8 text-sm text-blue-500 hover:text-blue-600 cursor-pointer"
															onClick={() =>
																window.open(deploymentUrl, "_blank")
															}
														/>
														<ExternalLink className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
													</div>

													<div className="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
														<Button
															variant="outline"
															size="sm"
															className="gap-2"
															onClick={() =>
																window.open(deployment.pullRequestURL, "_blank")
															}
														>
															<GithubIcon className="size-4" />
															Pull Request
														</Button>
														<ShowModalLogs
															appName={deployment.appName}
															serverId={data?.serverId || ""}
														>
															<Button
																variant="outline"
																size="sm"
																className="gap-2"
															>
																<FileText className="size-4" />
																Logs
															</Button>
														</ShowModalLogs>

														<ShowDeploymentsModal
															id={deployment.previewDeploymentId}
															type="previewDeployment"
															serverId={data?.serverId || ""}
														/>

														<AddPreviewDomain
															previewDeploymentId={`${deployment.previewDeploymentId}`}
															domainId={deployment.domain?.domainId}
														>
															<Button
																variant="ghost"
																size="sm"
																className="gap-2"
															>
																<PenSquare className="size-4" />
															</Button>
														</AddPreviewDomain>
														<DialogAction
															title="Delete Preview"
															description="Are you sure you want to delete this preview?"
															onClick={() =>
																handleDeletePreviewDeployment(
																	deployment.previewDeploymentId,
																)
															}
														>
															<Button
																variant="ghost"
																size="sm"
																isLoading={isLoading}
																className="text-red-600 hover:text-red-700 hover:bg-red-50"
															>
																<Trash2 className="size-4" />
															</Button>
														</DialogAction>
													</div>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</>
				) : (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							Preview deployments are disabled for this application, please
							enable it
						</span>
						<ShowPreviewSettings applicationId={applicationId} />
					</div>
				)}
			</CardContent>
		</Card>
	);
};
