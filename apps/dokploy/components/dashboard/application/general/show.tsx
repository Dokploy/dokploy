import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
	Ban,
	CheckCircle2,
	Hammer,
	RefreshCcw,
	Rocket,
	Terminal,
} from "lucide-react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
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
	const router = useRouter();
	const { t } = useTranslation("common");
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

	const { mutateAsync: deploy } = api.application.deploy.useMutation();

	const { mutateAsync: reload, isLoading: isReloading } =
		api.application.reload.useMutation();

	const { mutateAsync: redeploy } = api.application.redeploy.useMutation();

	return (
		<>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">
						{t("application.deploySettings.title")}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-4 flex-wrap">
					<TooltipProvider delayDuration={0} disableHoverableContent={false}>
						<DialogAction
							title={t("application.deploy.title")}
							description={t("application.deploy.confirm")}
							type="default"
							onClick={async () => {
								await deploy({
									applicationId: applicationId,
								})
									.then(() => {
										toast.success(t("application.deploy.success"));
										refetch();
										router.push(
											`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/application/${applicationId}?tab=deployments`,
										);
									})
									.catch(() => {
										toast.error(t("application.deploy.error"));
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
											{t("button.deploy")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("application.deploySettings.tooltip.deploy")}</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DialogAction>
						<DialogAction
							title={t("application.reload.title")}
							description={t("application.reload.confirm")}
							type="default"
							onClick={async () => {
								await reload({
									applicationId: applicationId,
									appName: data?.appName || "",
								})
									.then(() => {
										toast.success(t("application.reload.success"));
										refetch();
									})
									.catch(() => {
										toast.error(t("application.reload.error"));
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
											{t("button.reload")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("application.deploySettings.tooltip.reload")}</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DialogAction>
						<DialogAction
							title={t("application.rebuild.title")}
							description={t("application.rebuild.confirm")}
							type="default"
							onClick={async () => {
								await redeploy({
									applicationId: applicationId,
								})
									.then(() => {
										toast.success(t("application.rebuild.success"));
										refetch();
									})
									.catch(() => {
										toast.error(t("application.rebuild.error"));
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
											{t("button.rebuild")}
										</div>
									</TooltipTrigger>
									<TooltipPrimitive.Portal>
										<TooltipContent sideOffset={5} className="z-[60]">
											<p>{t("application.deploySettings.tooltip.rebuild")}</p>
										</TooltipContent>
									</TooltipPrimitive.Portal>
								</Tooltip>
							</Button>
						</DialogAction>

						{data?.applicationStatus === "idle" ? (
							<DialogAction
								title={t("application.start.title")}
								description={t("application.start.confirm")}
								type="default"
								onClick={async () => {
									await start({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.start.success"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.start.error"));
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
												{t("button.start")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("application.deploySettings.tooltip.start")}</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						) : (
							<DialogAction
								title={t("application.stop.title")}
								description={t("application.stop.confirm")}
								onClick={async () => {
									await stop({
										applicationId: applicationId,
									})
										.then(() => {
											toast.success(t("application.stop.success"));
											refetch();
										})
										.catch(() => {
											toast.error(t("application.stop.error"));
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
												{t("button.stop")}
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>{t("application.deploySettings.tooltip.stop")}</p>
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
							{t("button.openTerminal")}
						</Button>
					</DockerTerminalModal>
					<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
						<span className="text-sm font-medium">
							{t("application.deploySettings.autoDeploy")}
						</span>
						<Switch
							aria-label={t("application.deploySettings.autoDeploy")}
							checked={data?.autoDeploy || false}
							onCheckedChange={async (enabled) => {
								await update({
									applicationId,
									autoDeploy: enabled,
								})
									.then(async () => {
										toast.success(t("application.autoDeploy.update.success"));
										await refetch();
									})
									.catch(() => {
										toast.error(t("application.autoDeploy.update.error"));
									});
							}}
							className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
						/>
					</div>

					<div className="flex flex-row items-center gap-2 rounded-md px-4 py-2 border">
						<span className="text-sm font-medium">
							{t("application.deploySettings.cleanCache")}
						</span>
						<Switch
							aria-label={t("application.deploySettings.cleanCache")}
							checked={data?.cleanCache || false}
							onCheckedChange={async (enabled) => {
								await update({
									applicationId,
									cleanCache: enabled,
								})
									.then(async () => {
										toast.success(t("application.cleanCache.update.success"));
										await refetch();
									})
									.catch(() => {
										toast.error(t("application.cleanCache.update.error"));
									});
							}}
							className="flex flex-row gap-2 items-center data-[state=checked]:bg-primary"
						/>
					</div>
				</CardContent>
			</Card>
			<ShowProviderForm applicationId={applicationId} />
			<ShowBuildChooseForm applicationId={applicationId} />
		</>
	);
};
