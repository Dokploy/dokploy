import {
	ExternalLink,
	FileText,
	GitPullRequest,
	Hammer,
	Loader2,
	PenSquare,
	RefreshCw,
	RocketIcon,
	Trash2,
} from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { toast } from "sonner";
import {
	GiteaIcon,
	GithubIcon,
	GitlabIcon,
} from "@/components/icons/data-tools-icons";
import { SnapvisorLogo } from "@/components/icons/product-logos";
import { AlertBlock } from "@/components/shared/alert-block";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { ShowModalLogs } from "../../settings/web-server/show-modal-logs";
import { ShowDeploymentsModal } from "../deployments/show-deployments-modal";
import { AddPreviewDomain } from "./add-preview-domain";
import { BuildPreviewDeployment } from "./build-preview-deployment";
import { ShowPreviewSettings } from "./show-preview-settings";

/** Snapvisor `Build.status` → the label/tone shown on the preview card. */
const SNAPVISOR_STATUS_PRESENTATION: Record<
	string,
	{ label: string; className: string }
> = {
	pending: { label: "Pending", className: "text-muted-foreground" },
	progress: { label: "Pending", className: "text-muted-foreground" },
	"no-changes": { label: "No changes", className: "text-green-600" },
	"changes-detected": { label: "Changes detected", className: "text-yellow-600" },
	accepted: { label: "Approved", className: "text-green-600" },
	rejected: { label: "Rejected", className: "text-red-600" },
	error: { label: "Error", className: "text-red-600" },
	aborted: { label: "Error", className: "text-red-600" },
	expired: { label: "Expired", className: "text-muted-foreground" },
};

/**
 * Build statuses that can never change again on their own: a review outcome
 * (accepted/rejected) or a finished/failed run (no-changes/error/aborted/
 * expired). Polling stops once one of these is reached; a new commit gets a
 * new build anyway, registered by the next preview deploy.
 */
const SNAPVISOR_TERMINAL_STATUSES = new Set([
	"accepted",
	"rejected",
	"no-changes",
	"error",
	"aborted",
	"expired",
]);

/**
 * Snapvisor visual-diff badge for one preview deployment. Only rendered when
 * the application has a Snapvisor project linked (`show-preview-settings.tsx`);
 * polls the stored build linkage and offers a manual refresh + deep link.
 */
const SnapvisorPreviewBadge = ({
	previewDeploymentId,
}: {
	previewDeploymentId: string;
}) => {
	const { data, isPending } = api.snapvisor.previewBuild.useQuery(
		{ previewDeploymentId },
		{
			refetchInterval: (query) => {
				const status = query.state.data?.buildStatus;
				return status && SNAPVISOR_TERMINAL_STATUSES.has(status)
					? false
					: 15_000;
			},
		},
	);
	const { mutateAsync: refresh, isPending: isRefreshing } =
		api.snapvisor.refreshPreviewBuild.useMutation();
	const utils = api.useUtils();

	if (isPending || !data) return null;

	const presentation = data.buildStatus
		? SNAPVISOR_STATUS_PRESENTATION[data.buildStatus]
		: null;

	return (
		<div className="flex items-center gap-1">
			<Badge variant="outline" className="gap-1.5">
				<SnapvisorLogo className="size-3.5" />
				<span className={presentation?.className}>
					{data.buildId ? (presentation?.label ?? "Unknown") : "Not registered"}
				</span>
			</Badge>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				isLoading={isRefreshing}
				aria-label="Refresh Snapvisor status"
				onClick={async () => {
					await refresh({ previewDeploymentId })
						.then(async () => {
							await utils.snapvisor.previewBuild.invalidate({
								previewDeploymentId,
							});
						})
						.catch((error) => {
							toast.error("Error refreshing Snapvisor status", {
								description: error.message,
							});
						});
				}}
			>
				<RefreshCw className="size-3" />
			</Button>
			{data.reviewUrl && (
				<a
					href={data.reviewUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-blue-500 hover:underline"
				>
					Review in Snapvisor
				</a>
			)}
		</div>
	);
};

interface Props {
	applicationId: string;
}

export const ShowPreviewDeployments = ({ applicationId }: Props) => {
	const { data } = api.application.one.useQuery({ applicationId });
	const isGitlab = data?.sourceType === "gitlab";
	const isGitea = data?.sourceType === "gitea";
	const ChangeRequestIcon = isGitlab
		? GitlabIcon
		: isGitea
			? GiteaIcon
			: GithubIcon;
	const changeRequestLabel = isGitlab ? "Merge Request" : "Pull Request";

	const { mutateAsync: deletePreviewDeployment, isPending } =
		api.previewDeployment.delete.useMutation();

	const { mutateAsync: redeployPreviewDeployment } =
		api.previewDeployment.redeploy.useMutation();

	const {
		data: previewDeployments,
		refetch: refetchPreviewDeployments,
		isLoading: isLoadingPreviewDeployments,
	} = api.previewDeployment.all.useQuery(
		{ applicationId },
		{
			enabled: !!applicationId,
			refetchInterval: 2000,
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
					<div className="flex items-center gap-2">
						<BuildPreviewDeployment resource={data}>
							<Button variant="outline" className="gap-2">
								<GitPullRequest className="size-4" />
								Build {changeRequestLabel}
							</Button>
						</BuildPreviewDeployment>
						<ShowPreviewSettings applicationId={applicationId} />
					</div>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{data?.isPreviewDeploymentsActive ? (
					<>
						<div className="flex flex-col gap-2 text-sm">
							<span>
								Preview deployments let you test your application before you
								deploy it to production. Each {changeRequestLabel.toLowerCase()}{" "}
								gets a new deployment.
							</span>
						</div>
						{isGitea && (
							<AlertBlock type="info">
								<strong>Gitea / Forgejo:</strong> preview deployments are driven
								by the webhook you added for this application (its URL is shown
								in the Deployments tab). In the repository webhook settings,
								choose <strong>Custom Events</strong> and enable{" "}
								<strong>Pull Request</strong> and{" "}
								<strong>Pull Request Synchronized</strong> — without the latter,
								previews are created but never updated when new commits are
								pushed. Enable <strong>Pull Request Label</strong> as well if
								you use the preview labels filter.
							</AlertBlock>
						)}
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
														<GitPullRequest className="size-5 text-muted-foreground mt-1 shrink-0" />
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
													{data?.snapvisorProjectName && (
														<SnapvisorPreviewBadge
															previewDeploymentId={deployment.previewDeploymentId}
														/>
													)}
													<div className="relative grow">
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
															<ChangeRequestIcon className="size-4" />
															{changeRequestLabel}
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
														>
															<Button
																variant="outline"
																size="sm"
																className="gap-2"
															>
																<RocketIcon className="size-4" />
																Deployments
															</Button>
														</ShowDeploymentsModal>

														<DialogAction
															title="Rebuild Preview Deployment"
															description="Are you sure you want to rebuild this preview deployment?"
															type="default"
															onClick={async () => {
																await redeployPreviewDeployment({
																	previewDeploymentId:
																		deployment.previewDeploymentId,
																})
																	.then(() => {
																		toast.success(
																			"Preview deployment rebuild started",
																		);
																		refetchPreviewDeployments();
																	})
																	.catch(() => {
																		toast.error(
																			"Error rebuilding preview deployment",
																		);
																	});
															}}
														>
															<Button
																variant="outline"
																size="sm"
																isLoading={status === "running"}
																className="gap-2"
															>
																<TooltipProvider>
																	<Tooltip>
																		<TooltipTrigger asChild>
																			<div className="flex items-center gap-2">
																				<Hammer className="size-4" />
																				Rebuild
																			</div>
																		</TooltipTrigger>
																		<TooltipPrimitive.Portal>
																			<TooltipContent
																				sideOffset={5}
																				className="z-60"
																			>
																				<p>
																					Rebuild the preview deployment without
																					downloading new code
																				</p>
																			</TooltipContent>
																		</TooltipPrimitive.Portal>
																	</Tooltip>
																</TooltipProvider>
															</Button>
														</DialogAction>

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
																isLoading={isPending}
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
