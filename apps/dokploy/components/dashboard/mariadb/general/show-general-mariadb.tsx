import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	mariadbId: string;
}

export const ShowGeneralMariadb = ({ mariadbId }: Props) => {
	const { t } = useTranslation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? false;
	const { data, refetch } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{ enabled: !!mariadbId },
	);

	const { mutateAsync: reload, isPending: isReloading } =
		api.mariadb.reload.useMutation();

	const { mutateAsync: start, isPending: isStarting } =
		api.mariadb.start.useMutation();

	const { mutateAsync: stop, isPending: isStopping } =
		api.mariadb.stop.useMutation();

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.mariadb.deployWithLogs.useSubscription(
		{
			mariadbId: mariadbId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Deployment completed successfully!") {
					setIsDeploying(false);
				}
				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	return (
		<>
			<div className="flex w-full flex-col gap-5 ">
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl">
							{t("database.deploySettings")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						{canDeploy && (
							<TooltipProvider delayDuration={0}>
								<DialogAction
									title={t("database.deployConfirmTitle", {
										engine: "MariaDB",
									})}
									description={t("database.deployConfirmDescription", {
										engine: "MariaDB",
									})}
									type="default"
									onClick={async () => {
										setIsDeploying(true);
										await new Promise((resolve) => setTimeout(resolve, 1000));
										refetch();
									}}
								>
									<Button
										variant="default"
										isLoading={data?.applicationStatus === "running"}
										className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
									>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="flex items-center">
													<Rocket className="size-4 mr-1" />
													Deploy
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-60">
													<p>
														{t("database.setupDescription", {
															engine: "MariaDB",
														})}
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							</TooltipProvider>
						)}
						{canDeploy && (
							<TooltipProvider delayDuration={0}>
								<DialogAction
									title={t("database.reloadConfirmTitle", {
										engine: "MariaDB",
									})}
									description={t("database.reloadConfirmDescription", {
										engine: "MariaDB",
									})}
									type="default"
									onClick={async () => {
										await reload({
											mariadbId: mariadbId,
											appName: data?.appName || "",
										})
											.then(() => {
												toast.success(
													t("database.reloadSuccess", { engine: "MariaDB" }),
												);
												refetch();
											})
											.catch(() => {
												toast.error(
													t("database.reloadError", { engine: "MariaDB" }),
												);
											});
									}}
								>
									<Button
										variant="secondary"
										isLoading={isReloading}
										className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
									>
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="flex items-center">
													<RefreshCcw className="size-4 mr-1" />
													Reload
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-60">
													<p>
														{t("database.restartDescription", {
															engine: "MariaDB",
														})}
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							</TooltipProvider>
						)}
						{canDeploy &&
							(data?.applicationStatus === "idle" ? (
								<TooltipProvider delayDuration={0}>
									<DialogAction
										title={t("database.startConfirmTitle", {
											engine: "MariaDB",
										})}
										description={t("database.startConfirmDescription", {
											engine: "MariaDB",
										})}
										type="default"
										onClick={async () => {
											await start({
												mariadbId: mariadbId,
											})
												.then(() => {
													toast.success(
														t("database.startSuccess", { engine: "MariaDB" }),
													);
													refetch();
												})
												.catch(() => {
													toast.error(
														t("database.startError", { engine: "MariaDB" }),
													);
												});
										}}
									>
										<Button
											variant="secondary"
											isLoading={isStarting}
											className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
										>
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex items-center">
														<CheckCircle2 className="size-4 mr-1" />
														Start
													</div>
												</TooltipTrigger>
												<TooltipPrimitive.Portal>
													<TooltipContent sideOffset={5} className="z-60">
														<p>
															{t("database.startTooltip", {
																engine: "MariaDB",
															})}
														</p>
													</TooltipContent>
												</TooltipPrimitive.Portal>
											</Tooltip>
										</Button>
									</DialogAction>
								</TooltipProvider>
							) : (
								<TooltipProvider delayDuration={0}>
									<DialogAction
										title={t("database.stopConfirmTitle", {
											engine: "MariaDB",
										})}
										description={t("database.stopConfirmDescription", {
											engine: "MariaDB",
										})}
										onClick={async () => {
											await stop({
												mariadbId: mariadbId,
											})
												.then(() => {
													toast.success(
														t("database.stopSuccess", { engine: "MariaDB" }),
													);
													refetch();
												})
												.catch(() => {
													toast.error(
														t("database.stopError", { engine: "MariaDB" }),
													);
												});
										}}
									>
										<Button
											variant="destructive"
											isLoading={isStopping}
											className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
										>
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex items-center">
														<Ban className="size-4 mr-1" />
														Stop
													</div>
												</TooltipTrigger>
												<TooltipPrimitive.Portal>
													<TooltipContent sideOffset={5} className="z-60">
														<p>
															{t("database.stopDescription", {
																engine: "MariaDB",
															})}
														</p>
													</TooltipContent>
												</TooltipPrimitive.Portal>
											</Tooltip>
										</Button>
									</DialogAction>
								</TooltipProvider>
							))}
						<DockerTerminalModal
							appName={data?.appName || ""}
							serviceId={data?.mariadbId}
							serverId={data?.serverId || ""}
						>
							<Button
								variant="outline"
								className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex items-center">
											<Terminal className="size-4 mr-1" />
											Open Terminal
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-60">
											<p>
												{t("database.terminalDescription", {
													engine: "MariaDB",
												})}
											</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DockerTerminalModal>
					</CardContent>
				</Card>
				<DrawerLogs
					isOpen={isDrawerOpen}
					onClose={() => {
						setIsDrawerOpen(false);
						setFilteredLogs([]);
						setIsDeploying(false);
						refetch();
					}}
					filteredLogs={filteredLogs}
				/>
			</div>
		</>
	);
};
