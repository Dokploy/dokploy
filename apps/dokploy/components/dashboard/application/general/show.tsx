import { ShowBuildChooseForm } from "@/components/dashboard/application/build/show";
import { ShowProviderForm } from "@/components/dashboard/application/general/generic/show";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, Hammer, RefreshCcw, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import React from "react";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";
interface Props {
	applicationId: string;
}

export const ShowGeneralApplication = ({ applicationId }: Props) => {
	const router = useRouter();
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);
	const { mutateAsync: update } = api.application.update.useMutation();
	const { mutateAsync: start, isLoading: isStarting } =
		api.application.start.useMutation();
	const { mutateAsync: stop, isLoading: isStopping } =
		api.application.stop.useMutation();

	const { mutateAsync: deploy, isLoading: isDeploying } =
		api.application.deploy.useMutation();

	const { mutateAsync: reload, isLoading: isReloading } =
		api.application.reload.useMutation();

	const { mutateAsync: redeploy } = api.application.redeploy.useMutation();

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<DialogAction
						title="Deploy Application"
						description="Are you sure you want to deploy this application?"
						type="default"
						onClick={async () => {
							await deploy({
								applicationId: applicationId,
							})
								.then(() => {
									toast.success("Application deployed successfully");
									refetch();
									router.push(
										`/dashboard/project/${data?.projectId}/services/application/${applicationId}?tab=deployments`,
									);
								})
								.catch(() => {
									toast.error("Error deploying application");
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
						title="Reload Application"
						description="Are you sure you want to reload this application?"
						type="default"
						onClick={async () => {
							await reload({
								applicationId: applicationId,
								appName: data?.appName || "",
							})
								.then(() => {
									toast.success("Application reloaded successfully");
									refetch();
								})
								.catch(() => {
									toast.error("Error reloading application");
								});
						}}
					>
						<Button variant="secondary" isLoading={isReloading}>
							Reload
							<RefreshCcw className="size-4" />
						</Button>
					</DialogAction>
					<DialogAction
						title="Rebuild Application"
						description="Are you sure you want to rebuild this application?"
						type="default"
						onClick={async () => {
							await redeploy({
								applicationId: applicationId,
							})
								.then(() => {
									toast.success("Application rebuilt successfully");
									refetch();
								})
								.catch(() => {
									toast.error("Error rebuilding application");
								});
						}}
					>
						<Button
							variant="secondary"
							isLoading={data?.applicationStatus === "running"}
						>
							Rebuild
							<Hammer className="size-4" />
						</Button>
					</DialogAction>

					{data?.applicationStatus === "idle" ? (
						<DialogAction
							title="Start Application"
							description="Are you sure you want to start this application?"
							type="default"
							onClick={async () => {
								await start({
									applicationId: applicationId,
								})
									.then(() => {
										toast.success("Application started successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error starting application");
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
							title="Stop Application"
							description="Are you sure you want to stop this application?"
							onClick={async () => {
								await stop({
									applicationId: applicationId,
								})
									.then(() => {
										toast.success("Application stopped successfully");
										refetch();
									})
									.catch(() => {
										toast.error("Error stopping application");
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
					<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
						<span className="text-sm font-medium">Autodeploy</span>
						<Switch
							aria-label="Toggle italic"
							checked={data?.autoDeploy || false}
							onCheckedChange={async (enabled) => {
								await update({
									applicationId,
									autoDeploy: enabled,
								})
									.then(async () => {
										toast.success("Auto Deploy Updated");
										await refetch();
									})
									.catch(() => {
										toast.error("Error updating Auto Deploy");
									});
							}}
							className="flex flex-row gap-2 items-center"
						/>
					</div>
				</CardContent>
			</Card>
			<ShowProviderForm applicationId={applicationId} />
			<ShowBuildChooseForm applicationId={applicationId} />
		</>
	);
};
