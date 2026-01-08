import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useState } from "react";
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
	mysqlId: string;
}

export const ShowGeneralMysql = ({ mysqlId }: Props) => {
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
						<CardTitle className="text-xl">Deploy Settings</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row gap-4 flex-wrap">
						<TooltipProvider delayDuration={0}>
							<DialogAction
								title="Deploy MySQL"
								description="Are you sure you want to deploy this mysql?"
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
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Downloads and sets up the MySQL database</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							<DialogAction
								title="Reload MySQL"
								description="Are you sure you want to reload this mysql?"
								type="default"
								onClick={async () => {
									await reload({
										mysqlId: mysqlId,
										appName: data?.appName || "",
									})
										.then(() => {
											toast.success("MySQL reloaded successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error reloading MySQL");
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
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Restart the MySQL service without rebuilding</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
							{data?.applicationStatus === "idle" ? (
								<DialogAction
									title="Start MySQL"
									description="Are you sure you want to start this mysql?"
									type="default"
									onClick={async () => {
										await start({
											mysqlId: mysqlId,
										})
											.then(() => {
												toast.success("MySQL started successfully");
												refetch();
											})
											.catch(() => {
												toast.error("Error starting MySQL");
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
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>
														Start the MySQL database (requires a previous
														successful setup)
													</p>
												</TooltipContent>
											</TooltipPrimitive.Portal>
										</Tooltip>
									</Button>
								</DialogAction>
							) : (
								<DialogAction
									title="Stop MySQL"
									description="Are you sure you want to stop this mysql?"
									onClick={async () => {
										await stop({
											mysqlId: mysqlId,
										})
											.then(() => {
												toast.success("MySQL stopped successfully");
												refetch();
											})
											.catch(() => {
												toast.error("Error stopping MySQL");
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
												<TooltipContent sideOffset={5} className="z-[60]">
													<p>Stop the currently running MySQL database</p>
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
											Open Terminal
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>Open a terminal to the MySQL container</p>
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
