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
import {
	ExternalLink,
	FileText,
	GitPullRequest,
	Layers,
	PenSquare,
	RocketIcon,
	Trash2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { AddPreviewDomain } from "./add-preview-domain";
import { ShowPreviewBuilds } from "./show-preview-builds";
import { ShowPreviewSettings } from "./show-preview-settings";

interface Props {
	applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery({ applicationId });

	const { mutateAsync: deletePreviewDeployment, isLoading } =
		api.previewDeployment.delete.useMutation();

	const { data: previewDeployments, refetch: refetchPreviewDeployments } =
		api.previewDeployment.all.useQuery(
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
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
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
						{!previewDeployments?.length ? (
							<div className="flex w-full flex-col items-center justify-center gap-3 pt-10">
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
											className="group relative overflow-hidden rounded-lg border transition-colors"
										>
											<div
												className={`absolute top-0 left-0 h-full w-1 ${
													status === "done"
														? "bg-green-500"
														: status === "running"
															? "bg-yellow-500"
															: "bg-red-500"
												}`}
											/>

											<div className="p-4">
												<div className="mb-3 flex items-start justify-between">
													<div className="flex items-start gap-3">
														<GitPullRequest className="mt-1 size-5 flex-shrink-0 text-muted-foreground" />
														<div>
															<div className="font-medium text-sm">
																{deployment.pullRequestTitle}
															</div>
															<div className="mt-1 text-muted-foreground text-sm">
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

												<div className="space-y-3 pl-8">
													<div className="relative flex-grow">
														<Input
															value={deploymentUrl}
															readOnly
															className="cursor-pointer pr-8 text-blue-500 text-sm hover:text-blue-600"
															onClick={() =>
																window.open(deploymentUrl, "_blank")
															}
														/>
														<ExternalLink className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-gray-400" />
													</div>

													<div className="flex gap-2 opacity-80 transition-opacity group-hover:opacity-100">
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

														<ShowPreviewBuilds
															deployments={deployment.deployments || []}
															serverId={data?.serverId || ""}
															trigger={
																<Button
																	variant="outline"
																	size="sm"
																	className="gap-2"
																>
																	<Layers className="size-4" />
																	Builds
																</Button>
															}
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
																className="text-red-600 hover:bg-red-50 hover:text-red-700"
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
