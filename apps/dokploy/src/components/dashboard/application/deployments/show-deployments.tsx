import {
	ChevronDown,
	ChevronUp,
	Clock,
	Copy,
	Loader2,
	RefreshCcw,
	RocketIcon,
	Settings,
	Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import copy from "copy-to-clipboard";
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

export const ShowDeployments = ({
	id,
	type,
	refreshToken,
	serverId,
}: Props) => {
	const t = useTranslations("applicationDeployments");
	const tCommon = useTranslations("common");
	const [activeLog, setActiveLog] = useState<
		RouterOutputs["deployment"]["all"][number] | null
	>(null);
	const { data: deployments, isPending: isLoadingDeployments } =
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

	const { mutateAsync: rollback, isPending: isRollingBack } =
		api.rollback.rollback.useMutation();
	const { mutateAsync: killProcess, isPending: isKillingProcess } =
		api.deployment.killProcess.useMutation();
	const { mutateAsync: removeDeployment, isPending: isRemovingDeployment } =
		api.deployment.removeDeployment.useMutation();

	// Cancel deployment mutations
	const {
		mutateAsync: cancelApplicationDeployment,
		isPending: isCancellingApp,
	} = api.application.cancelDeployment.useMutation();
	const {
		mutateAsync: cancelComposeDeployment,
		isPending: isCancellingCompose,
	} = api.compose.cancelDeployment.useMutation();

	const [url, setUrl] = React.useState("");
	const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
		new Set(),
	);

	const webhookUrl = useMemo(
		() =>
			`${url}/api/deploy${type === "compose" ? "/compose" : ""}/${refreshToken}`,
		[url, refreshToken, type],
	);

	const typeLabel = useMemo(() => {
		const labels: Record<Props["type"], string> = {
			application: t("typeLabels.application"),
			compose: t("typeLabels.compose"),
			schedule: t("typeLabels.schedule"),
			server: t("typeLabels.server"),
			backup: t("typeLabels.backup"),
			previewDeployment: t("typeLabels.previewDeployment"),
			volumeBackup: t("typeLabels.volumeBackup"),
		};
		return labels[type];
	}, [t, type]);

	const formatDurationLabel = useCallback(
		(totalSeconds: number) => {
			if (totalSeconds < 60) {
				return t("list.durationSeconds", { seconds: totalSeconds });
			}
			const minutes = Math.floor(totalSeconds / 60);
			const remainingSeconds = totalSeconds % 60;
			return t("list.durationMinutes", { minutes, seconds: remainingSeconds });
		},
		[t],
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
					<CardTitle className="text-xl">{t("list.title")}</CardTitle>
					<CardDescription>
						{t("list.description", { type: typeLabel })}
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
								{t("list.configureRollbacks")} <Settings className="size-4" />
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
									{t("list.stuckTitle")}
								</div>
								<p className="text-sm">{t("list.stuckBody")}</p>
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
										toast.success(t("list.cancelDeploymentToast"));
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: t("list.cancelDeploymentError"),
										);
									}
								}}
							>
								{t("list.cancelDeployment")}
							</Button>
						</div>
					</AlertBlock>
				)}
				{refreshToken && (
					<div className="flex flex-col gap-2 text-sm">
						<span>{t("list.webhookIntro")}</span>
						<div className="flex flex-row items-center gap-2 flex-wrap">
							<span>{t("list.webhookLabel")} </span>
							<div className="flex flex-row items-center gap-2">
								<Badge
									role="button"
									tabIndex={0}
									aria-label={t("list.copyWebhookAria")}
									className="p-2 rounded-md ml-1 mr-1 hover:border-primary hover:text-primary-foreground hover:bg-primary hover:cursor-pointer whitespace-normal break-all"
									variant="outline"
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											copy(webhookUrl);
											toast.success(t("list.copiedToast"));
										}
									}}
									onClick={() => {
										copy(webhookUrl);
										toast.success(t("list.copiedToast"));
									}}
								>
									{webhookUrl}
									<Copy className="h-4 w-4 ml-2" />
								</Badge>
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
							{t("list.loading")}
						</span>
					</div>
				) : deployments?.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							{t("list.empty")}
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
															? t("list.collapseCommitAria")
															: t("list.expandCommitAria")
													}
												>
													{isExpanded ? (
														<>
															<ChevronUp className="size-3" />
															{t("list.showLess")}
														</>
													) : (
														<>
															<ChevronDown className="size-3" />
															{t("list.showMore")}
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
													{formatDurationLabel(
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
													title={t("list.killProcess.dialogTitle")}
													description={t("list.killProcess.dialogDescription")}
													type="default"
													onClick={async () => {
														await killProcess({
															deploymentId: deployment.deploymentId,
														})
															.then(() => {
																toast.success(t("list.killProcess.success"));
															})
															.catch(() => {
																toast.error(t("list.killProcess.error"));
															});
													}}
												>
													<Button
														variant="destructive"
														size="sm"
														isLoading={isKillingProcess}
														className="w-full sm:w-auto"
													>
														{t("list.killProcess.button")}
													</Button>
												</DialogAction>
											)}
											<Button
												onClick={() => {
													setActiveLog(deployment);
												}}
												className="w-full sm:w-auto"
											>
												{t("list.view")}
											</Button>

											{canDelete && (
												<DialogAction
													title={t("list.deleteDeployment.dialogTitle")}
													description={t(
														"list.deleteDeployment.dialogDescription",
													)}
													type="default"
													onClick={async () => {
														try {
															await removeDeployment({
																deploymentId: deployment.deploymentId,
															});
															toast.success(t("list.deleteDeployment.success"));
														} catch (error) {
															toast.error(t("list.deleteDeployment.error"));
														}
													}}
												>
													<Button
														variant="destructive"
														size="sm"
														isLoading={isRemovingDeployment}
													>
														{tCommon("delete")}
														<Trash2 className="size-4" />
													</Button>
												</DialogAction>
											)}

											{deployment?.rollback &&
												deployment.status === "done" &&
												type === "application" && (
													<DialogAction
														title={t("list.rollback.dialogTitle")}
														description={
															<div className="flex flex-col gap-3">
																<p>{t("list.rollback.confirmQuestion")}</p>
																<AlertBlock type="info" className="text-sm">
																	{t("list.rollback.infoAlert")}
																</AlertBlock>
															</div>
														}
														type="default"
														onClick={async () => {
															await rollback({
																rollbackId: deployment.rollback.rollbackId,
															})
																.then(() => {
																	toast.success(t("list.rollback.success"));
																})
																.catch(() => {
																	toast.error(t("list.rollback.error"));
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
															{t("list.rollback.button")}
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
