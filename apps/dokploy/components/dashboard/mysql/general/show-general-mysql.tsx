import { DialogAction } from "@/components/shared/dialog-action";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, RefreshCcw, Terminal } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
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
						<DialogAction
							title="Deploy Mysql"
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
							>
								Deploy
							</Button>
						</DialogAction>
						<DialogAction
							title="Reload Mysql"
							description="Are you sure you want to reload this mysql?"
							type="default"
							onClick={async () => {
								await reload({
									mysqlId: mysqlId,
									appName: data?.appName || "",
								})
									.then(() => {
										toast.success("Mysql reloaded successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error reloading Mysql");
									});
							}}
						>
							<Button variant="secondary" isLoading={isReloading}>
								Reload
								<RefreshCcw className="size-4" />
							</Button>
						</DialogAction>
						{data?.applicationStatus === "idle" ? (
							<DialogAction
								title="Start Mysql"
								description="Are you sure you want to start this mysql?"
								type="default"
								onClick={async () => {
									await start({
										mysqlId: mysqlId,
									})
										.then(() => {
											toast.success("Mysql started successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error starting Mysql");
										});
								}}
							>
								<Button variant="secondary" isLoading={isStarting}>
									Start
									<CheckCircle2 className="size-4" />
								</Button>
							</DialogAction>
						) : (
							<DialogAction
								title="Stop Mysql"
								description="Are you sure you want to stop this mysql?"
								onClick={async () => {
									await stop({
										mysqlId: mysqlId,
									})
										.then(() => {
											toast.success("Mysql stopped successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error stopping Mysql");
										});
								}}
							>
								<Button variant="destructive" isLoading={isStopping}>
									Stop
									<Ban className="size-4" />
								</Button>
							</DialogAction>
						)}

						<DockerTerminalModal
							appName={data?.appName || ""}
							serverId={data?.serverId || ""}
						>
							<Button variant="outline">
								<Terminal />
								Open Terminal
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
