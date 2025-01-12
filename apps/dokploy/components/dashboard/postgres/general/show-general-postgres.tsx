import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, RefreshCcw, Terminal } from "lucide-react";
import React, { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	postgresId: string;
}

export const ShowGeneralPostgres = ({ postgresId }: Props) => {
	const { data, refetch } = api.postgres.one.useQuery(
		{
			postgresId: postgresId,
		},
		{ enabled: !!postgresId },
	);

	const { mutateAsync: deploy, isLoading: isDeployingMutation } =
		api.postgres.deploy.useMutation({
			onSuccess: () => {
				console.log("Deployment started");
			},
			onError: (error) => {
				console.error("Deploy error:", error);
				toast.error("Error starting deployment");
			},
		});

	const { mutateAsync: reload, isLoading: isReloading } =
		api.postgres.reload.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.postgres.stop.useMutation();

	const { mutateAsync: start, isLoading: isStarting } =
		api.postgres.start.useMutation();

	const [chunk, setChunk] = useState<string>("");

	const onError = useCallback((error: any) => {
		console.error("Error:", error);
	}, []);

	const [enabled, setEnabled] = useState(false);

	const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);

	api.postgres.deploy.useSubscription(
		{
			postgresId: postgresId,
		},
		{
			enabled: isDeploying,
			onData(log) {
				console.log("Received log in component:", log);
				setDeploymentLogs((prev) => [...prev, log]);
			},
			onError(error) {
				console.error("Deployment logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader className="pb-4">
					<CardTitle>General</CardTitle>
					{/* {!isConnected && (
						<div className="text-sm text-yellow-500">
							Connecting to deployment logs...
						</div>
					)} */}
				</CardHeader>
				<CardContent className="space-y-4">
					<DialogAction
						title="Deploy Postgres"
						description="Are you sure you want to deploy this postgres?"
						type="default"
						onClick={async () => {
							console.log("Deploy button clicked");
							setDeploymentLogs([]);
							setIsDeploying(true);

							// try {
							// } catch (error) {
							// 	console.error("Deploy error:", error);
							// 	// setIsDeploying(false);
							// } finally {
							// 	// No desactivamos isDeploying aquí, lo haremos cuando termine la suscripción
							// }
						}}
					>
						<Button
							variant="default"
							isLoading={
								data?.applicationStatus === "running" || isDeployingMutation
							}
						>
							Deploy
						</Button>
					</DialogAction>
					<div className="font-mono text-sm whitespace-pre-wrap max-h-60 overflow-auto">
						{deploymentLogs.join("\n")}
					</div>
					<DialogAction
						title="Reload Postgres"
						description="Are you sure you want to reload this postgres?"
						type="default"
						onClick={async () => {
							await reload({
								postgresId: postgresId,
								appName: data?.appName || "",
							})
								.then(() => {
									toast.success("Postgres reloaded successfully");
									refetch();
								})
								.catch(() => {
									toast.error("Error reloading Postgres");
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
							title="Start Postgres"
							description="Are you sure you want to start this postgres?"
							type="default"
							onClick={async () => {
								await start({
									postgresId: postgresId,
								})
									.then(() => {
										toast.success("Postgres started successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error starting Postgres");
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
							title="Stop Postgres"
							description="Are you sure you want to stop this postgres?"
							onClick={async () => {
								await stop({
									postgresId: postgresId,
								})
									.then(() => {
										toast.success("Postgres stopped successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error stopping Postgres");
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
			<div className="mt-4 bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
				{deploymentLogs.map((log, index) => (
					<pre
						key={index}
						className="text-sm text-gray-300 whitespace-pre-wrap"
					>
						{log}
					</pre>
				))}
				{deploymentLogs.length === 0 && (
					<p className="text-gray-500 text-sm">No deployment logs yet</p>
				)}
			</div>
		</div>
	);
};
