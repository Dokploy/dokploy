import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
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
			<TooltipProvider delayDuration={0} disableHoverableContent={false}>
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
					<Button
						variant="default"
						isLoading={data?.composeStatus === "running"}
						className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
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
									<p>Downloads the source code and performs a complete build</p>
								</TooltipContent>
							</TooltipPrimitive.Portal>
						</Tooltip>
					</Button>
				</DialogAction>
				<DialogAction
					title="Reload Compose"
					description="Are you sure you want to reload this compose?"
					type="default"
					onClick={async () => {
						await redeploy({
							composeId: composeId,
						})
							.then(() => {
								toast.success("Compose reloaded successfully");
								refetch();
							})
							.catch(() => {
								toast.error("Error reloading compose");
							});
					}}
				>
					<Button
						variant="secondary"
						isLoading={data?.composeStatus === "running"}
						className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
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
									<p>Reload the compose without rebuilding it</p>
								</TooltipContent>
							</TooltipPrimitive.Portal>
						</Tooltip>
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
						<Button
							variant="secondary"
							isLoading={isStarting}
							className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
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
											Start the compose (requires a previous successful build)
										</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
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
						<Button
							variant="destructive"
							isLoading={isStopping}
							className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
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
										<p>Stop the currently running compose</p>
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
					<Terminal className="size-4 mr-1" />
					Open Terminal
				</Button>
			</DockerTerminalModal>
			<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
				<span className="text-sm font-medium">Autodeploy</span>
				<Switch
					aria-label="Toggle autodeploy"
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
					className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
				/>
			</div>
		</div>
	);
};
