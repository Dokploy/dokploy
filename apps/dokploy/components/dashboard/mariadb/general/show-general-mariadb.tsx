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
	mariadbId: string;
}

export const ShowGeneralMariadb = ({ mariadbId }: Props) => {
	const { t } = useTranslation("dashboard");
	const { data, refetch } = api.mariadb.one.useQuery(
		{
			mariadbId,
		},
		{ enabled: !!mariadbId },
	);

	const { mutateAsync: reload, isLoading: isReloading } =
		api.mariadb.reload.useMutation();

	const { mutateAsync: start, isLoading: isStarting } =
		api.mariadb.start.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
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

				if (log === t("dashboard.mariadb.deploymentCompleted")) {
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
							{t("dashboard.mariadb.deploySettings")}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<TooltipProvider delayDuration={0}>
							<DialogAction
								title={t("dashboard.mariadb.deployMariadb")}
								description={t("dashboard.mariadb.deployMariadbDescription")}
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
												{t("dashboard.mariadb.deploy")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("dashboard.mariadb.deployTooltip")}</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						</TooltipProvider>
						<TooltipProvider delayDuration={0}>
							<DialogAction
								title={t("dashboard.mariadb.reloadMariadb")}
								description={t("dashboard.mariadb.reloadMariadbDescription")}
								type="default"
								onClick={async () => {
									await reload({
										mariadbId: mariadbId,
										appName: data?.appName || "",
									})
										.then(() => {
											toast.success(
												t("dashboard.mariadb.reloadedSuccessfully"),
											);
											refetch();
										})
										.catch(() => {
											toast.error(t("dashboard.mariadb.errorReloading"));
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
												{t("dashboard.mariadb.reload")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("dashboard.mariadb.reloadTooltip")}</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						</TooltipProvider>
						{data?.applicationStatus === "idle" ? (
							<TooltipProvider delayDuration={0}>
								<DialogAction
									title={t("dashboard.mariadb.startMariadb")}
									description={t("dashboard.mariadb.startMariadbDescription")}
									type="default"
									onClick={async () => {
										await start({
											mariadbId: mariadbId,
										})
											.then(() => {
												toast.success(
													t("dashboard.mariadb.startedSuccessfully"),
												);
												refetch();
											})
											.catch(() => {
												toast.error(t("dashboard.mariadb.errorStarting"));
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
													{t("dashboard.mariadb.start")}
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>{t("dashboard.mariadb.startTooltip")}</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							</TooltipProvider>
						) : (
							<TooltipProvider delayDuration={0}>
								<DialogAction
									title={t("dashboard.mariadb.stopMariadb")}
									description={t("dashboard.mariadb.stopMariadbDescription")}
									onClick={async () => {
										await stop({
											mariadbId: mariadbId,
										})
											.then(() => {
												toast.success(
													t("dashboard.mariadb.stoppedSuccessfully"),
												);
												refetch();
											})
											.catch(() => {
												toast.error(t("dashboard.mariadb.errorStopping"));
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
													{t("dashboard.mariadb.stop")}
												</div>
											</TooltipTrigger>
											<TooltipPrimitive.Portal>
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>{t("dashboard.mariadb.stopTooltip")}</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							</TooltipProvider>
						)}
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
											{t("dashboard.mariadb.openTerminal")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("dashboard.mariadb.openTerminalTooltip")}</p>
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
