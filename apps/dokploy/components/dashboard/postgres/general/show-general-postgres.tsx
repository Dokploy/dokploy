import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, RefreshCcw, Terminal } from "lucide-react";
import React from "react";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
import { DialogAction } from "@/components/shared/dialog-action";
import { toast } from "sonner";
interface Props {
	postgresId: string;
}

export const ShowGeneralPostgres = ({ postgresId }: Props) => {
	const { data, refetch } = api.postgres.one.useQuery(
		{
			postgresId,
		},
		{ enabled: !!postgresId },
	);

	const { mutateAsync: deploy } = api.postgres.deploy.useMutation();

	const { mutateAsync: reload, isLoading: isReloading } =
		api.postgres.reload.useMutation();
	const { mutateAsync: start, isLoading: isStarting } =
		api.postgres.start.useMutation();

	const { mutateAsync: stop, isLoading: isStopping } =
		api.postgres.stop.useMutation();
	return (
		<div className="flex w-full flex-col gap-5 ">
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<DialogAction
						title="Deploy Postgres"
						description="Are you sure you want to deploy this postgres?"
						type="default"
						onClick={async () => {
							await deploy({
								postgresId: postgresId,
							})
								.then(() => {
									toast.success("Postgres deployed successfully");
									refetch();
								})
								.catch(() => {
									toast.error("Error deploying Postgres");
								});
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
		</div>
	);
};
