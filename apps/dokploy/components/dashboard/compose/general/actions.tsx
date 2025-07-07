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
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { DockerTerminalModal } from "../../settings/web-server/docker-terminal-modal";

interface Props {
	composeId: string;
}
export const ComposeActions = ({ composeId }: Props) => {
	const { t } = useTranslation("dashboard");
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
					title={t("dashboard.compose.deployCompose")}
					description={t("dashboard.compose.deployComposeDescription")}
					type="default"
					onClick={async () => {
						await deploy({
							composeId: composeId,
						})
							.then(() => {
								toast.success(
									t("dashboard.compose.composeDeployedSuccessfully"),
								);
								refetch();
								router.push(
									`/dashboard/project/${data?.project.projectId}/services/compose/${composeId}?tab=deployments`,
								);
							})
							.catch(() => {
								toast.error(t("dashboard.compose.errorDeployingCompose"));
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
									{t("dashboard.compose.deploy")}
								</div>
							</TooltipTrigger>
							<TooltipPrimitive.Portal>
								<TooltipContent sideOffset={5} className="z-[60]">
									<p>{t("dashboard.compose.deployTooltip")}</p>
								</TooltipContent>
							</TooltipPrimitive.Portal>
						</Tooltip>
					</Button>
				</DialogAction>
				<DialogAction
					title={t("dashboard.compose.reloadCompose")}
					description={t("dashboard.compose.reloadComposeDescription")}
					type="default"
					onClick={async () => {
						await redeploy({
							composeId: composeId,
						})
							.then(() => {
								toast.success(
									t("dashboard.compose.composeReloadedSuccessfully"),
								);
								refetch();
							})
							.catch(() => {
								toast.error(t("dashboard.compose.errorReloadingCompose"));
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
									{t("dashboard.compose.reload")}
								</div>
							</TooltipTrigger>
							<TooltipPrimitive.Portal>
								<TooltipContent sideOffset={5} className="z-[60]">
									<p>{t("dashboard.compose.reloadTooltip")}</p>
								</TooltipContent>
							</TooltipPrimitive.Portal>
						</Tooltip>
					</Button>
				</DialogAction>
				{data?.composeType === "docker-compose" &&
				data?.composeStatus === "idle" ? (
					<DialogAction
						title={t("dashboard.compose.startCompose")}
						description={t("dashboard.compose.startComposeDescription")}
						type="default"
						onClick={async () => {
							await start({
								composeId: composeId,
							})
								.then(() => {
									toast.success(
										t("dashboard.compose.composeStartedSuccessfully"),
									);
									refetch();
								})
								.catch(() => {
									toast.error(t("dashboard.compose.errorStartingCompose"));
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
										{t("dashboard.compose.start")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-[60]">
										<p>{t("dashboard.compose.startTooltip")}</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
						</Button>
					</DialogAction>
				) : (
					<DialogAction
						title={t("dashboard.compose.stopCompose")}
						description={t("dashboard.compose.stopComposeDescription")}
						onClick={async () => {
							await stop({
								composeId: composeId,
							})
								.then(() => {
									toast.success(
										t("dashboard.compose.composeStoppedSuccessfully"),
									);
									refetch();
								})
								.catch(() => {
									toast.error(t("dashboard.compose.errorStoppingCompose"));
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
										{t("dashboard.compose.stop")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-[60]">
										<p>{t("dashboard.compose.stopTooltip")}</p>
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
					{t("dashboard.compose.openTerminal")}
				</Button>
			</DockerTerminalModal>
			<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
				<span className="text-sm font-medium">
					{t("dashboard.compose.autodeploy")}
				</span>
				<Switch
					aria-label={t("dashboard.compose.toggleAutodeploy")}
					checked={data?.autoDeploy || false}
					onCheckedChange={async (enabled) => {
						await update({
							composeId,
							autoDeploy: enabled,
						})
							.then(async () => {
								toast.success(t("dashboard.compose.autoDeployUpdated"));
								await refetch();
							})
							.catch(() => {
								toast.error(t("dashboard.compose.errorUpdatingAutoDeploy"));
							});
					}}
					className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
				/>
			</div>
		</div>
	);
};
