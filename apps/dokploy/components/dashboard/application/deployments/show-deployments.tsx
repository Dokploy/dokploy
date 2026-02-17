import {
	ChevronDown,
	ChevronUp,
	Clock,
	Loader2,
	RefreshCcw,
	RocketIcon,
	Settings,
	Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { api, type RouterOutputs } from "@/utils/api";
import { ShowRollbackSettings } from "../rollbacks/show-rollback-settings";
import { CancelQueues } from "./cancel-queues";
import { ClearDeployments } from "./clear-deployments";
import { KillBuild } from "./kill-build";
import { RefreshToken } from "./refresh-token";
import { ShowDeployment } from "./show-deployment";

interface Props {
	id: string;
	type:
		| "application"
		| "compose"
		| "schedule"
		| "server"
		| "backup"
		| "previewDeployment"
		| "volumeBackup";
	refreshToken?: string;
	serverId?: string;
}

export const formatDuration = (seconds: number) => {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
};

export const ShowDeployments = ({
	id,
	type,
	refreshToken,
	serverId,
}: Props) => {
	const [activeLog, setActiveLog] = useState<
		RouterOutputs["deployment"]["all"][number] | null
	>(null);
	const { data: deployments, isLoading: isLoadingDeployments } =
		api.deployment.allByType.useQuery(
			{
				id,
				type,
			},
			{
				enabled: !!id,
				refetchInterval: 1000,
			},
		);

	const { data: isCloud } = api.settings.isCloud.useQuery();

	const { mutateAsync: rollback, isLoading: isRollingBack } =
		api.rollback.rollback.useMutation();
	const { mutateAsync: killProcess, isLoading: isKillingProcess } =
		api.deployment.killProcess.useMutation();
	const { mutateAsync: removeDeployment, isLoading: isRemovingDeployment } =
		api.deployment.removeDeployment.useMutation();

	// Cancel deployment mutations
	const {
		mutateAsync: cancelApplicationDeployment,
		isLoading: isCancellingApp,
	} = api.application.cancelDeployment.useMutation();
	const {
		mutateAsync: cancelComposeDeployment,
		isLoading: isCancellingCompose,
	} = api.compose.cancelDeployment.useMutation();

	const [url, setUrl] = React.useState("");
	const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
		new Set(),
	);

	const MAX_DESCRIPTION_LENGTH = 200;

	const truncateDescription = (description: string): string => {
		if (description.length <= MAX_DESCRIPTION_LENGTH) {
			return description;
		}
		const truncated = description.slice(0, MAX_DESCRIPTION_LENGTH);
		const lastSpace = truncated.lastIndexOf(" ");
		if (lastSpace > MAX_DESCRIPTION_LENGTH - 20 && lastSpace > 0) {
			return `${truncated.slice(0, lastSpace)}...`;
		}
		return `${truncated}...`;
	};

	// Check for stuck deployment (more than 9 minutes) - only for the most recent deployment
	const stuckDeployment = useMemo(() => {
		if (!isCloud || !deployments || deployments.length === 0) return null;

		const now = Date.now();
		const NINE_MINUTES = 10 * 60 * 1000; // 9 minutes in milliseconds

		// Get the most recent deployment (first in the list since they're sorted by date)
		const mostRecentDeployment = deployments[0];

		if (
			!mostRecentDeployment ||
			mostRecentDeployment.status !== "running" ||
			!mostRecentDeployment.startedAt
		) {
			return null;
		}

		const startTime = new Date(mostRecentDeployment.startedAt).getTime();
		const elapsed = now - startTime;

		return elapsed > NINE_MINUTES ? mostRecentDeployment : null;
	}, [isCloud, deployments]);
	useEffect(() => {
		setUrl(document.location.origin);
	}, []);

	return (
		<Card className="bg-background border-none">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Deployments</CardTitle>
					<CardDescription>
						See the last 10 deployments for this {type}
					</CardDescription>
				</div>
				<div className="flex flex-row items-center flex-wrap gap-2">
					{(type === "application" || type === "compose") && (
						<ClearDeployments id={id} type={type} />
					)}
					{(type === "application" || type === "compose") && (
						<KillBuild id={id} type={type} />
					)}
					{(type === "application" || type === "compose") && (
						<CancelQueues id={id} type={type} />
					)}
					{type === "application" && (
						<ShowRollbackSettings applicationId={id}>
							<Button variant="outline">
								Configure Rollbacks <Settings className="size-4" />
							</Button>
						</ShowRollbackSettings>
					)}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{stuckDeployment && (type === "application" || type === "compose") && (
					<AlertBlock
						type="warning"
						className="flex-col items-start w-full p-4"
					>
						<div className="flex flex-col gap-3">
							<div>
								<div className="font-medium text-sm mb-1">
									Build appears to be stuck
								</div>
								<p className="text-sm">
									Hey! Looks like the build has been running for more than 10
									minutes. Would you like to cancel this deployment?
								</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								className="w-fit"
								isLoading={
									type === "application" ? isCancellingApp : isCancellingCompose
								}
								onClick={async () => {
									try {
										if (type === "application") {
											await cancelApplicationDeployment({
												applicationId: id,
											});
										} else if (type === "compose") {
											await cancelComposeDeployment({
												composeId: id,
											});
										}
										toast.success("Deployment cancellation requested");
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to cancel deployment",
										);
									}
								}}
							>
								Cancel Deployment
							</Button>
						</div>
					</AlertBlock>
				)}
				{refreshToken && (
					<div className="flex flex-col gap-2 text-sm">
						<span>
							If you want to re-deploy this application use this URL in the
							config of your git provider or docker
						</span>
						<div className="flex flex-row items-center gap-2 flex-wrap">
							<span>Webhook URL: </span>
							<div className="flex flex-row items-center gap-2">
								<span className="break-all text-muted-foreground">
									{`${url}/api/deploy${
										type === "compose" ? "/compose" : ""
									}/${refreshToken}`}
								</span>
								{(type === "application" || type === "compose") && (
									<RefreshToken id={id} type={type} />
								)}
							</div>
						</div>
					</div>
				)}

				{isLoadingDeployments ? (
					<div className="flex w-full flex-row items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<Loader2 className="size-6 text-muted-foreground animate-spin" />
						<span className="text-base text-muted-foreground">
							Loading deployments...
						</span>
					</div>
				) : deployments?.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							No deployments found
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{deployments?.map((deployment, index) => {
							const titleText = deployment?.title?.trim() || "";
							const needsTruncation = titleText.length > MAX_DESCRIPTION_LENGTH;
							const isExpanded = expandedDescriptions.has(
								deployment.deploymentId,
							);
							const canDelete =
								deployment.status === "done" || deployment.status === "error";

							return (
								<div
									key={deployment.deploymentId}
									className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex flex-1 flex-col min-w-0">
										<span className="flex items-center gap-4 font-medium capitalize text-foreground">
											{index + 1}. {deployment.status}
											<StatusTooltip
												status={deployment?.status}
												className="size-2.5"
											/>
										</span>

										<div className="flex flex-col gap-1">
											<span className="break-words text-sm text-muted-foreground whitespace-pre-wrap">
												{isExpanded || !needsTruncation
													? titleText
													: truncateDescription(titleText)}
											</span>
											{needsTruncation && (
												<button
													type="button"
													onClick={() => {
														const next = new Set(expandedDescriptions);
														if (next.has(deployment.deploymentId)) {
															next.delete(deployment.deploymentId);
														} else {
															next.add(deployment.deploymentId);
														}
														setExpandedDescriptions(next);
													}}
													className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit mt-1 cursor-pointer"
													aria-label={
														isExpanded
															? "Collapse commit message"
															: "Expand commit message"
													}
												>
													{isExpanded ? (
														<>
															<ChevronUp className="size-3" />
															Show less
														</>
													) : (
														<>
															<ChevronDown className="size-3" />
															Show more
														</>
													)}
												</button>
											)}
											{/* Hash (from description) - shown in compact form */}
											{deployment.description?.trim() && (
												<span className="text-xs text-muted-foreground font-mono">
													{deployment.description}
												</span>
											)}
										</div>
									</div>
									<div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:max-w-[300px] sm:items-end sm:justify-start">
										<div className="text-sm capitalize text-muted-foreground flex flex-wrap items-center gap-2">
											<DateTooltip date={deployment.createdAt} />
											{deployment.startedAt && deployment.finishedAt && (
												<Badge
													variant="outline"
													className="text-[10px] gap-1 flex items-center"
												>
													<Clock className="size-3" />
													{formatDuration(
														Math.floor(
															(new Date(deployment.finishedAt).getTime() -
																new Date(deployment.startedAt).getTime()) /
																1000,
														),
													)}
												</Badge>
											)}
										</div>

										<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
											{deployment.pid && deployment.status === "running" && (
												<DialogAction
													title="Kill Process"
													description="Are you sure you want to kill the process?"
													type="default"
													onClick={async () => {
														await killProcess({
															deploymentId: deployment.deploymentId,
														})
															.then(() => {
																toast.success("Process killed successfully");
															})
															.catch(() => {
																toast.error("Error killing process");
															});
													}}
												>
													<Button
														variant="destructive"
														size="sm"
														isLoading={isKillingProcess}
														className="w-full sm:w-auto"
													>
														Kill Process
													</Button>
												</DialogAction>
											)}
											<Button
												onClick={() => {
													setActiveLog(deployment);
												}}
												className="w-full sm:w-auto"
											>
												View
											</Button>

											{canDelete && (
												<DialogAction
													title="Delete Deployment"
													description="Are you sure you want to delete this deployment? This action cannot be undone."
													type="default"
													onClick={async () => {
														try {
															await removeDeployment({
																deploymentId: deployment.deploymentId,
															});
															toast.success("Deployment deleted successfully");
														} catch (error) {
															toast.error("Error deleting deployment");
														}
													}}
												>
													<Button
														variant="destructive"
														size="sm"
														isLoading={isRemovingDeployment}
													>
														Delete
														<Trash2 className="size-4" />
													</Button>
												</DialogAction>
											)}

											{deployment?.rollback &&
												deployment.status === "done" &&
												type === "application" && (
													<DialogAction
														title="Rollback to this deployment"
														description={
															<div className="flex flex-col gap-3">
																<p>
																	Are you sure you want to rollback to this
																	deployment?
																</p>
																<AlertBlock type="info" className="text-sm">
																	Please wait a few seconds while the image is
																	pulled from the registry. Your application
																	should be running shortly.
																</AlertBlock>
															</div>
														}
														type="default"
														onClick={async () => {
															await rollback({
																rollbackId: deployment.rollback.rollbackId,
															})
																.then(() => {
																	toast.success(
																		"Rollback initiated successfully",
																	);
																})
																.catch(() => {
																	toast.error("Error initiating rollback");
																});
														}}
													>
														<Button
															variant="secondary"
															size="sm"
															isLoading={isRollingBack}
															className="w-full sm:w-auto"
														>
															<RefreshCcw className="size-4 text-primary group-hover:text-red-500" />
															Rollback
														</Button>
													</DialogAction>
												)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
				<ShowDeployment
					serverId={activeLog?.buildServerId || serverId}
					open={Boolean(activeLog && activeLog.logPath !== null)}
					onClose={() => setActiveLog(null)}
					logPath={activeLog?.logPath || ""}
					errorMessage={activeLog?.errorMessage || ""}
				/>
			</CardContent>
		</Card>
	);
};
