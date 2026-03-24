import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Ban, CheckCircle2, RefreshCcw, Rocket, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("composeGeneral");
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
						title={t("actions.deploy.dialogTitle")}
						description={t("actions.deploy.dialogDescription")}
						type="default"
						onClick={async () => {
							await deploy({
								composeId: composeId,
							})
								.then(() => {
									toast.success(t("actions.deploy.toastSuccess"));
									refetch();
									router.push(
										`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/compose/${composeId}?tab=deployments`,
									);
								})
								.catch(() => {
									toast.error(t("actions.deploy.toastError"));
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
										{t("actions.deploy.button")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-[60]">
										<p>{t("actions.deploy.tooltip")}</p>
									</TooltipContent>
								</TooltipPrimitive.Portal>
							</Tooltip>
						</Button>
					</DialogAction>
				)}
				{canDeploy && (
					<DialogAction
						title={t("actions.reload.dialogTitle")}
						description={t("actions.reload.dialogDescription")}
						type="default"
						onClick={async () => {
							await redeploy({
								composeId: composeId,
							})
								.then(() => {
									toast.success(t("actions.reload.toastSuccess"));
									refetch();
								})
								.catch(() => {
									toast.error(t("actions.reload.toastError"));
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
										{t("actions.reload.button")}
									</div>
								</TooltipTrigger>
								<TooltipPrimitive.Portal>
									<TooltipContent sideOffset={5} className="z-[60]">
										<p>{t("actions.reload.tooltip")}</p>
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
							title={t("actions.start.dialogTitle")}
							description={t("actions.start.dialogDescription")}
							type="default"
							onClick={async () => {
								await start({
									composeId: composeId,
								})
									.then(() => {
										toast.success(t("actions.start.toastSuccess"));
										refetch();
									})
									.catch(() => {
										toast.error(t("actions.start.toastError"));
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
											{t("actions.start.button")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("actions.start.tooltip")}</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DialogAction>
					) : (
						<DialogAction
							title={t("actions.stop.dialogTitle")}
							description={t("actions.stop.dialogDescription")}
							onClick={async () => {
								await stop({
									composeId: composeId,
								})
									.then(() => {
										toast.success(t("actions.stop.toastSuccess"));
										refetch();
									})
									.catch(() => {
										toast.error(t("actions.stop.toastError"));
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
											{t("actions.stop.button")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("actions.stop.tooltip")}</p>
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
					{t("actions.openTerminal")}
				</Button>
			</DockerTerminalModal>
			{canUpdateService && (
				<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
					<span className="text-sm font-medium">
						{t("actions.autodeploy.label")}
					</span>
					<Switch
						aria-label={t("actions.autodeploy.ariaLabel")}
						checked={data?.autoDeploy || false}
						onCheckedChange={async (enabled) => {
							await update({
								composeId,
								autoDeploy: enabled,
							})
								.then(async () => {
									toast.success(t("actions.autodeploy.toastSuccess"));
									await refetch();
								})
								.catch(() => {
									toast.error(t("actions.autodeploy.toastError"));
								});
						}}
						className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
					/>
				</div>
			)}
		</div>
	);
};
