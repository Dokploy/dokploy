import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { Ban, CheckCircle2, Hammer, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
	const router = useRouter();
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: update } = api.compose.update.useMutation();
	const { mutateAsync: deploy } = api.compose.deploy.useMutation();
	const { mutateAsync: redeploy } = api.compose.redeploy.useMutation();
	const { mutateAsync: start, isLoading: isStarting } =
		api.compose.start.useMutation();
	const { mutateAsync: stop, isLoading: isStopping } =
		api.compose.stop.useMutation();
	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			<DialogAction
				title="Deploy Compose"
				description="Are you sure you want to deploy this compose?"
				type="default"
				onClick={async () => {
					await deploy({
						composeId: composeId,
					})
						.then(() => {
							toast.success("Compose deployed successfully");
							refetch();
							router.push(
								`/dashboard/project/${data?.project.projectId}/services/compose/${composeId}?tab=deployments`,
							);
						})
						.catch(() => {
							toast.error("Error deploying compose");
						});
				}}
			>
				<Button variant="default" isLoading={data?.composeStatus === "running"}>
					Deploy
				</Button>
			</DialogAction>
			<DialogAction
				title="Rebuild Compose"
				description="Are you sure you want to rebuild this compose?"
				type="default"
				onClick={async () => {
					await redeploy({
						composeId: composeId,
					})
						.then(() => {
							toast.success("Compose rebuilt successfully");
							refetch();
						})
						.catch(() => {
							toast.error("Error rebuilding compose");
						});
				}}
			>
				<Button
					variant="secondary"
					isLoading={data?.composeStatus === "running"}
				>
					Rebuild
					<Hammer className="size-4" />
				</Button>
			</DialogAction>
			{data?.composeType === "docker-compose" &&
			data?.composeStatus === "idle" ? (
				<DialogAction
					title="Start Compose"
					description="Are you sure you want to start this compose?"
					type="default"
					onClick={async () => {
						await start({
							composeId: composeId,
						})
							.then(() => {
								toast.success("Compose started successfully");
								refetch();
							})
							.catch(() => {
								toast.error("Error starting compose");
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
					title="Stop Compose"
					description="Are you sure you want to stop this compose?"
					onClick={async () => {
						await stop({
							composeId: composeId,
						})
							.then(() => {
								toast.success("Compose stopped successfully");
								refetch();
							})
							.catch(() => {
								toast.error("Error stopping compose");
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
							composeId,
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
		</div>
	);
};
