import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useRouter } from "next/router";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
	return (
		<div className="flex flex-row gap-4 w-full flex-wrap ">
			<TooltipProvider delayDuration={0} disableHoverableContent={false}>
				{canDeploy && (
					<DialogAction
						title={t("compose.deployTitle")}
						description={t("compose.deployConfirm")}
						type="default"
						onClick={async () => {
							await deploy({
								composeId: composeId,
							})
								.then(() => {
									toast.success(t("compose.deployed"));
									refetch();
									router.push(
										`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/compose/${composeId}?tab=deployments`,
									);
								})
								.catch(() => {
									toast.error(t("compose.deployError"));
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
										{t("compose.deploy")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-60">
										<p>{t("compose.deployTooltip")}</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
						</Button>
					</DialogAction>
				)}
				{canDeploy && (
					<DialogAction
						title={t("compose.rebuildTitle")}
						description={t("compose.rebuildConfirm")}
						type="default"
						onClick={async () => {
							await redeploy({
								composeId: composeId,
							})
								.then(() => {
									toast.success(t("compose.rebuilt"));
									refetch();
								})
								.catch(() => {
									toast.error(t("compose.rebuildError"));
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
										{t("compose.rebuild")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-60">
										<p>{t("compose.rebuildTooltip")}</p>
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
							title={t("compose.startTitle")}
							description={t("compose.startConfirm")}
							type="default"
							onClick={async () => {
								await start({
									composeId: composeId,
								})
									.then(() => {
										toast.success(t("compose.started"));
										refetch();
									})
									.catch(() => {
										toast.error(t("compose.startError"));
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
											{t("compose.start")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-60">
											<p>{t("compose.startTooltip")}</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DialogAction>
					) : (
						<DialogAction
							title={t("compose.stopTitle")}
							description={t("compose.stopConfirm")}
							onClick={async () => {
								await stop({
									composeId: composeId,
								})
									.then(() => {
										toast.success(t("compose.stopped"));
										refetch();
									})
									.catch(() => {
										toast.error(t("compose.stopError"));
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
											{t("compose.stop")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-60">
											<p>{t("compose.stopTooltip")}</p>
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
				serviceId={data?.composeId}
			>
				<Button
					variant="outline"
					className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2"
				>
					<Terminal className="size-4 mr-1" />
					{t("compose.openTerminal")}
				</Button>
			</DockerTerminalModal>
			{canUpdateService && (
				<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
					<span className="text-sm font-medium">{t("compose.autodeploy")}</span>
					<Switch
						aria-label={t("compose.toggleAutodeploy")}
						checked={data?.autoDeploy || false}
						onCheckedChange={async (enabled) => {
							await update({
								composeId,
								autoDeploy: enabled,
							})
								.then(async () => {
									toast.success(t("compose.autodeployUpdated"));
									await refetch();
								})
								.catch(() => {
									toast.error(t("compose.autodeployUpdateError"));
								});
						}}
						className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
					/>
				</div>
			)}
		</div>
	);
};
