import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? false;
	const canUpdateService = permissions?.service.create ?? false;
	const { data, refetch } = api.compose.one.useQuery(
		{
			composeId,
		},
		{ enabled: !!composeId },
	);
	const { mutateAsync: update } = api.compose.update.useMutation();
	const { mutateAsync: deploy } = api.compose.deploy.useMutation();
	const { mutateAsync: redeploy } = api.compose.redeploy.useMutation();
	const { mutateAsync: start, isPending: isStarting } =
		api.compose.start.useMutation();
	const { mutateAsync: stop, isPending: isStopping } =
		api.compose.stop.useMutation();
	const [commitHash, setCommitHash] = useState("");
	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			<TooltipProvider delayDuration={0} disableHoverableContent={false}>
				{canDeploy && (
					<DialogAction
						title="Deploy Compose"
						description={
							<div className="space-y-2">
								<p>Are you sure you want to deploy this compose?</p>
								<div className="space-y-1">
									<p className="text-xs text-muted-foreground">
										Optional: Deploy a specific commit hash (7-40 hex
										characters)
									</p>
									<Input
										value={commitHash}
										onChange={(e) => {
											setCommitHash(e.target.value);
										}}
										placeholder="e.g. a1b2c3d4"
									/>
								</div>
							</div>
						}
						type="default"
						onClick={async () => {
							const normalizedCommitHash = commitHash.trim();
							if (
								normalizedCommitHash &&
								!/^[a-fA-F0-9]{7,40}$/.test(normalizedCommitHash)
							) {
								toast.error(
									"Invalid commit hash. Use 7-40 hexadecimal characters.",
								);
								return;
							}
							await deploy({
								composeId: composeId,
								...(normalizedCommitHash && {
									commitHash: normalizedCommitHash,
								}),
							})
								.then(() => {
									toast.success("Compose deployed successfully");
									setCommitHash("");
									refetch();
									router.push(
										`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/compose/${composeId}?tab=deployments`,
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
										<p>
											Downloads the source code and performs a complete build
										</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
						</Button>
					</DialogAction>
				)}
				{canDeploy && (
					<DialogAction
						title="Reload Compose"
						description="Are you sure you want to reload this compose?"
						type="default"
						onClick={async () => {
							const normalizedCommitHash = commitHash.trim();
							if (
								normalizedCommitHash &&
								!/^[a-fA-F0-9]{7,40}$/.test(normalizedCommitHash)
							) {
								toast.error(
									"Invalid commit hash. Use 7-40 hexadecimal characters.",
								);
								return;
							}
							await redeploy({
								composeId: composeId,
								...(normalizedCommitHash && {
									commitHash: normalizedCommitHash,
								}),
							})
								.then(() => {
									toast.success("Compose reloaded successfully");
									setCommitHash("");
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
				)}
				{canDeploy &&
					(data?.composeType === "docker-compose" &&
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
					))}
			</TooltipProvider>
			<DockerTerminalModal
				appName={data?.appName || ""}
				serverId={data?.serverId || ""}
				appType={data?.composeType || "docker-compose"}
			>
				<Button
					variant="outline"
					className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<Terminal className="size-4 mr-1" />
					Open Terminal
				</Button>
			</DockerTerminalModal>
			{canUpdateService && (
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
			)}
		</div>
	);
};
