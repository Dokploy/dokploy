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
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	mysqlId: string;
}

export const ShowGeneralMysql = ({ mysqlId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data, refetch } = api.mysql.one.useQuery(
		{
			mysqlId,
		},
		{ enabled: !!mysqlId },
	);

	const { mutateAsync: reload, isLoading: isReloading } =
		api.mysql.reload.useMutation();
	const { mutateAsync: start, isLoading: isStarting } =
		api.mysql.start.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.mysql.stop.useMutation();

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	api.mysql.deployWithLogs.useSubscription(
		{
			mysqlId: mysqlId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === t("dashboard.mysql.deploymentCompleted")) {
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
							{t("dashboard.mysql.deploySettings")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<TooltipProvider delayDuration={0}>
							<DialogAction
								title={t("dashboard.mysql.deployMysql")}
								description={t("dashboard.mysql.deployMysqlDescription")}
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
												{t("dashboard.mysql.deploy")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("dashboard.mysql.deployTooltip")}</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							<DialogAction
								title={t("dashboard.mysql.reloadMysql")}
								description={t("dashboard.mysql.reloadMysqlDescription")}
								type="default"
								onClick={async () => {
									await reload({
										mysqlId: mysqlId,
										appName: data?.appName || "",
									})
										.then(() => {
											toast.success(t("dashboard.mysql.reloadedSuccessfully"));
											refetch();
										})
										.catch(() => {
											toast.error(t("dashboard.mysql.errorReloading"));
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
												{t("dashboard.mysql.reload")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("dashboard.mysql.reloadTooltip")}</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							{data?.applicationStatus === "idle" ? (
								<DialogAction
									title={t("dashboard.mysql.startMysql")}
									description={t("dashboard.mysql.startMysqlDescription")}
									type="default"
									onClick={async () => {
										await start({
											mysqlId: mysqlId,
										})
											.then(() => {
												toast.success(t("dashboard.mysql.startedSuccessfully"));
												refetch();
											})
											.catch(() => {
												toast.error(t("dashboard.mysql.errorStarting"));
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
													{t("dashboard.mysql.start")}
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>{t("dashboard.mysql.startTooltip")}</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							) : (
								<DialogAction
									title={t("dashboard.mysql.stopMysql")}
									description={t("dashboard.mysql.stopMysqlDescription")}
									onClick={async () => {
										await stop({
											mysqlId: mysqlId,
										})
											.then(() => {
												toast.success(t("dashboard.mysql.stoppedSuccessfully"));
												refetch();
											})
											.catch(() => {
												toast.error(t("dashboard.mysql.errorStopping"));
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
													{t("dashboard.mysql.stop")}
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>{t("dashboard.mysql.stopTooltip")}</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							)}
						</TooltipProvider>
						<DockerTerminalModal
							appName={data?.appName || ""}
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
											{t("dashboard.mysql.openTerminal")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("dashboard.mysql.openTerminalTooltip")}</p>
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
