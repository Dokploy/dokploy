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
	postgresId: string;
}

export const ShowGeneralPostgres = ({ postgresId }: Props) => {
	const { t } = useTranslation();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? false;
	const { data, refetch } = api.postgres.one.useQuery(
		{
			postgresId: postgresId,
		},
		{ enabled: !!postgresId },
	);

	const { mutateAsync: reload, isPending: isReloading } =
		api.postgres.reload.useMutation();

	const { mutateAsync: stop, isPending: isStopping } =
		api.postgres.stop.useMutation();

	const { mutateAsync: start, isPending: isStarting } =
		api.postgres.start.useMutation();

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.postgres.deployWithLogs.useSubscription(
		{
			postgresId: postgresId,
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
						<TooltipProvider disableHoverableContent={false}>
							{canDeploy && (
								<DialogAction
									title={t("database.deployConfirmTitle", {
										engine: "PostgreSQL",
									})}
									description={t("database.deployConfirmDescription", {
										engine: "PostgreSQL",
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
															engine: "PostgreSQL",
														})}
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							)}
							{canDeploy && (
								<DialogAction
									title={t("database.reloadConfirmTitle", {
										engine: "PostgreSQL",
									})}
									description={t("database.reloadConfirmDescription", {
										engine: "PostgreSQL",
									})}
									type="default"
									onClick={async () => {
										await reload({
											postgresId: postgresId,
											appName: data?.appName || "",
										})
											.then(() => {
												toast.success(
													t("database.reloadSuccess", { engine: "PostgreSQL" }),
												);
												refetch();
											})
											.catch(() => {
												toast.error(
													t("database.reloadError", { engine: "PostgreSQL" }),
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
														Restart the PostgreSQL service without rebuilding
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							)}
							{canDeploy &&
								(data?.applicationStatus === "idle" ? (
									<DialogAction
										title={t("database.startConfirmTitle", {
											engine: "PostgreSQL",
										})}
										description={t("database.startConfirmDescription", {
											engine: "PostgreSQL",
										})}
										type="default"
										onClick={async () => {
											await start({
												postgresId: postgresId,
											})
												.then(() => {
													toast.success(
														t("database.startSuccess", {
															engine: "PostgreSQL",
														}),
													);
													refetch();
												})
												.catch(() => {
													toast.error(
														t("database.startError", { engine: "PostgreSQL" }),
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
																engine: "PostgreSQL",
															})}
														</p>
													</TooltipContent>
												</TooltipPrimitive.Portal>
											</Tooltip>
										</Button>
									</DialogAction>
								) : (
									<DialogAction
										title={t("database.stopConfirmTitle", {
											engine: "PostgreSQL",
										})}
										description={t("database.stopConfirmDescription", {
											engine: "PostgreSQL",
										})}
										onClick={async () => {
											await stop({
												postgresId: postgresId,
											})
												.then(() => {
													toast.success(
														t("database.stopSuccess", { engine: "PostgreSQL" }),
													);
													refetch();
												})
												.catch(() => {
													toast.error(
														t("database.stopError", { engine: "PostgreSQL" }),
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
															Stop the currently running PostgreSQL database
														</p>
													</TooltipContent>
												</TooltipPrimitive.Portal>
											</Tooltip>
										</Button>
									</DialogAction>
								))}
						</TooltipProvider>
						<DockerTerminalModal
							appName={data?.appName || ""}
							serviceId={data?.postgresId}
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
													engine: "PostgreSQL",
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
