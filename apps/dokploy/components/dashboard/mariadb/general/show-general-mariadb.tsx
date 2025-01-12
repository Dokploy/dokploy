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
	mariadbId: string;
}

export const ShowGeneralMariadb = ({ mariadbId }: Props) => {
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
							title="Deploy Mariadb"
							description="Are you sure you want to deploy this mariadb?"
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
							title="Reload Mariadb"
							description="Are you sure you want to reload this mariadb?"
							type="default"
							onClick={async () => {
								await reload({
									mariadbId: mariadbId,
									appName: data?.appName || "",
								})
									.then(() => {
										toast.success("Mariadb reloaded successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error reloading Mariadb");
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
								title="Start Mariadb"
								description="Are you sure you want to start this mariadb?"
								type="default"
								onClick={async () => {
									await start({
										mariadbId: mariadbId,
									})
										.then(() => {
											toast.success("Mariadb started successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error starting Mariadb");
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
								title="Stop Mariadb"
								description="Are you sure you want to stop this mariadb?"
								onClick={async () => {
									await stop({
										mariadbId: mariadbId,
									})
										.then(() => {
											toast.success("Mariadb stopped successfully");
											refetch();
										})
										.catch(() => {
											toast.error("Error stopping Mariadb");
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
