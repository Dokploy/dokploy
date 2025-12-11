import {
	ChevronDown,
	ChevronUp,
	Clock,
	Loader2,
	RefreshCcw,
	RocketIcon,
	Settings,
} from "lucide-react";
import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("common");

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

	const typeLabel = useMemo(() => {
		switch (type) {
			case "application":
				return t("service.type.application");
			case "compose":
				return t("service.type.compose");
			case "backup":
				return t("backups.page.title");
			case "schedule":
				return t("schedules.page.title");
			case "server":
				return t("dashboard.servers");
			case "previewDeployment":
				return t("tabs.previewDeployments");
			case "volumeBackup":
				return t("volumeBackups.page.title");
			default:
				return type;
		}
	}, [t, type]);

	const statusLabels: Record<string, string> = {
		done: t("deployments.status.done"),
		running: t("deployments.status.running"),
		error: t("deployments.status.error"),
		pending: t("deployments.status.pending"),
		queued: t("deployments.status.queued"),
	};

	const formatTitle = (title?: string) => {
		if (!title) return "";
		const trimmed = title.trim();
		if (trimmed.toLowerCase() === "manual deployment") {
			return t("deployments.title.manual");
		}
		return trimmed;
	};

	return (
		<Card className="bg-background border-none">
			<CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">{t("tabs.deployments")}</CardTitle>
					<CardDescription>
						{t("deployments.card.description", { type: typeLabel })}
					</CardDescription>
				</div>
				<div className="flex flex-row items-center gap-2">
					{(type === "application" || type === "compose") && (
						<KillBuild id={id} type={type} />
					)}
					{(type === "application" || type === "compose") && (
						<CancelQueues id={id} type={type} />
					)}
					{type === "application" && (
						<ShowRollbackSettings applicationId={id}>
							<Button variant="outline">
								{t("deployments.rollback.button")}
								<Settings className="size-4" />
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
									{t("deployments.stuck.title")}
								</div>
								<p className="text-sm">{t("deployments.stuck.description")}</p>
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
										toast.success(t("deployments.stuck.toast.success"));
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: t("deployments.stuck.toast.error"),
										);
									}
								}}
							>
								{t("deployments.stuck.cancelButton")}
							</Button>
						</div>
					</AlertBlock>
				)}
				{refreshToken && (
					<div className="flex flex-col gap-2 text-sm">
						<span>{t("deployments.webhook.description")}</span>
						<div className="flex flex-row items-center gap-2 flex-wrap">
							<span>{t("deployments.webhook.label")}</span>
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
							{t("deployments.loading")}
						</span>
					</div>
				) : deployments?.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center gap-3 pt-10 min-h-[25vh]">
						<RocketIcon className="size-8 text-muted-foreground" />
						<span className="text-base text-muted-foreground">
							{t("deployments.empty")}
						</span>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{deployments?.map((deployment, index) => {
							const rawTitle = deployment?.title?.trim() || "";
							const titleText = formatTitle(rawTitle);
							const needsTruncation = titleText.length > MAX_DESCRIPTION_LENGTH;
							const isExpanded = expandedDescriptions.has(
								deployment.deploymentId,
							);
							const statusKey = deployment.status || "";
							const statusLabel =
								(statusKey && statusLabels[statusKey]) ||
								deployment.status ||
								"";

							return (
								<div
									key={deployment.deploymentId}
									className="flex items-center justify-between rounded-lg border p-4 gap-2"
								>
									<div className="flex flex-col">
										<span className="flex items-center gap-4 font-medium capitalize text-foreground">
											{index + 1}. {statusLabel}
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
															? t("deployments.expand.ariaLabel")
															: t("deployments.collapse.ariaLabel")
													}
												>
													{isExpanded ? (
														<>
															<ChevronUp className="size-3" />
															{t("deployments.expand.button")}
														</>
													) : (
														<>
															<ChevronDown className="size-3" />
															{t("deployments.collapse.button")}
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
									<div className="flex flex-col items-end gap-2 max-w-[300px] w-full justify-start">
										<div className="text-sm capitalize text-muted-foreground flex items-center gap-2">
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

										<div className="flex flex-row items-center gap-2">
											{deployment.pid && deployment.status === "running" && (
												<DialogAction
													title={t("deployments.kill.title")}
													description={t("deployments.kill.description")}
													type="default"
													onClick={async () => {
														await killProcess({
															deploymentId: deployment.deploymentId,
														})
															.then(() => {
																toast.success(
																	t("deployments.kill.toast.success"),
																);
															})
															.catch(() => {
																toast.error(t("deployments.kill.toast.error"));
															});
													}}
												>
													<Button
														variant="destructive"
														size="sm"
														isLoading={isKillingProcess}
													>
														{t("deployments.kill.button")}
													</Button>
												</DialogAction>
											)}
											<Button
												onClick={() => {
													setActiveLog(deployment);
												}}
											>
												{t("deployments.button.view")}
											</Button>

											{deployment?.rollback &&
												deployment.status === "done" &&
												type === "application" && (
													<DialogAction
														title={t("deployments.rollback.title")}
														description={t("deployments.rollback.description")}
														type="default"
														onClick={async () => {
															await rollback({
																rollbackId: deployment.rollback.rollbackId,
															})
																.then(() => {
																	toast.success(
																		t("deployments.rollback.toast.success"),
																	);
																})
																.catch(() => {
																	toast.error(
																		t("deployments.rollback.toast.error"),
																	);
																});
														}}
													>
														<Button
															variant="secondary"
															size="sm"
															isLoading={isRollingBack}
														>
															<RefreshCcw className="size-4 text-primary group-hover:text-red-500" />
															{t("deployments.rollback.button")}
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
