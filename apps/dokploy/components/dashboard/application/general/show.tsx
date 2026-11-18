import {
	Ban,
	CheckCircle2,
	Hammer,
	RefreshCcw,
	Rocket,
	Terminal,
} from "lucide-react";
import { useRouter } from "next/router";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ShowBuildChooseForm } from "@/components/dashboard/application/build/show";
import { ShowProviderForm } from "@/components/dashboard/application/general/generic/show";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	applicationId: string;
}

export const ShowGeneralApplication = ({ applicationId }: Props) => {
	const { t } = useTranslation();
	const router = useRouter();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canDeploy = permissions?.deployment.create ?? false;
	const canUpdateService = permissions?.service.create ?? false;
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);
	const { mutateAsync: update } = api.application.update.useMutation();
	const { mutateAsync: start, isPending: isStarting } =
		api.application.start.useMutation();
	const { mutateAsync: stop, isPending: isStopping } =
		api.application.stop.useMutation();

	const { mutateAsync: deploy } = api.application.deploy.useMutation();

	const { mutateAsync: reload, isPending: isReloading } =
		api.application.reload.useMutation();

	const { mutateAsync: redeploy } = api.application.redeploy.useMutation();

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">
						{t("application.general.deploySettings")}
					</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 lg:flex lg:flex-row lg:flex-wrap gap-4">
					<TooltipProvider delayDuration={0} disableHoverableContent={false}>
						{canDeploy && (
							<DialogAction
								title={t("application.general.deployApplication")}
								description={t("application.general.deployApplicationConfirm")}
								type="default"
								onClick={async () => {
									await deploy({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.general.deployed"));
											refetch();
											router.push(
												`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/application/${applicationId}?tab=deployments`,
											);
										})
										.catch(() => {
											toast.error(t("application.general.deployError"));
										});
								}}
							>
								<Button
									variant="default"
									isLoading={data?.applicationStatus === "running"}
									className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
											<Rocket className="size-4 mr-1" />
											{t("application.general.deploy")}
										</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-60">
												<p>
													{t(
														"application.general.deployTooltip",
													)}
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}
						{canDeploy && (
								<DialogAction
									title={t("application.general.reloadApplication")}
									description={t("application.general.reloadApplicationConfirm")}
								type="default"
								onClick={async () => {
									await reload({
										applicationId: applicationId,
										appName: data?.appName || "",
									})
										.then(() => {
											toast.success(t("application.general.reloaded"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.general.reloadError"));
										});
								}}
							>
								<Button
									variant="secondary"
									isLoading={isReloading}
									className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<RefreshCcw className="size-4 mr-1" />
												{t("application.general.reload")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-60">
												<p>
													{t("application.general.reloadTooltip")}
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}
						{canDeploy && (
								<DialogAction
									title={t("application.general.rebuildApplication")}
									description={t(
										"application.general.rebuildApplicationConfirm",
									)}
								type="default"
								onClick={async () => {
									await redeploy({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.general.rebuilt"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.general.rebuildError"));
										});
								}}
							>
								<Button
									variant="secondary"
									isLoading={data?.applicationStatus === "running"}
									className="flex items-center gap-1.5 group focus-visible:ring-2 focus-visible:ring-offset-2"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<Hammer className="size-4 mr-1" />
												{t("application.general.rebuild")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-60">
												<p>
													{t("application.general.rebuildTooltip")}
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}

						{canDeploy && data?.applicationStatus === "idle" ? (
								<DialogAction
									title={t("application.general.startApplication")}
									description={t("application.general.startApplicationConfirm")}
								type="default"
								onClick={async () => {
									await start({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.general.started"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.general.startError"));
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
												{t("application.general.start")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-60">
												<p>
													{t("application.general.startTooltip")}
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						) : canDeploy ? (
								<DialogAction
									title={t("application.general.stopApplication")}
									description={t("application.general.stopApplicationConfirm")}
								onClick={async () => {
									await stop({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.general.stopped"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.general.stopError"));
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
												{t("application.general.stop")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-60">
												<p>
													{t("application.general.stopTooltip")}
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						) : null}
					</TooltipProvider>
					<DockerTerminalModal
						appName={data?.appName || ""}
						serverId={data?.serverId || ""}
						serviceId={applicationId}
					>
						<Button
							variant="outline"
							className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-offset-2 col-span-2"
						>
							<Terminal className="size-4 mr-1" />
							{t("application.general.openTerminal")}
						</Button>
					</DockerTerminalModal>
					{canUpdateService && (
						<div className="flex flex-row items-center gap-2 justify-between rounded-md px-4 py-2 border col-span-2 md:col-span-1">
							<span className="text-sm font-medium">
								{t("application.general.autodeploy")}
							</span>
							<Switch
								aria-label={t("application.general.toggleAutodeploy")}
								checked={data?.autoDeploy || false}
								onCheckedChange={async (enabled) => {
									await update({
										applicationId,
										autoDeploy: enabled,
									})
										.then(async () => {
											toast.success(t("application.general.autoDeployUpdated"));
											await refetch();
										})
										.catch(() => {
											toast.error(t("application.general.autoDeployError"));
										});
								}}
								className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
							/>
						</div>
					)}

					{canUpdateService && (
						<div className="flex flex-row items-center gap-2 justify-between rounded-md px-4 py-2 border col-span-2 md:col-span-1">
							<span className="text-sm font-medium">
								{t("application.general.cleanCache")}
							</span>
							<Switch
								aria-label={t("application.general.toggleCleanCache")}
								checked={data?.cleanCache || false}
								onCheckedChange={async (enabled) => {
									await update({
										applicationId,
										cleanCache: enabled,
									})
										.then(async () => {
											toast.success(t("application.general.cleanCacheUpdated"));
											await refetch();
										})
										.catch(() => {
											toast.error(t("application.general.cleanCacheError"));
										});
								}}
								className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
							/>
						</div>
					)}
				</CardContent>
			</Card>
			<ShowProviderForm applicationId={applicationId} />
			<ShowBuildChooseForm applicationId={applicationId} />
		</>
	);
};
