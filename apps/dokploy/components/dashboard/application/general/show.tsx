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
			<Card className="bg-background border-border/50">
				<CardHeader>
					<CardTitle className="text-xl">Deploy Settings</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-row gap-2 flex-wrap">
					<TooltipProvider delayDuration={0} disableHoverableContent={false}>
						{canDeploy && (
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
												`/dashboard/project/${data?.environment.projectId}/environment/${data?.environmentId}/services/application/${applicationId}?tab=deployments`,
											);
										})
										.catch(() => {
											toast.error("Error deploying application");
										});
								}}
							>
								<Button
									variant="default"
									size="sm"
									isLoading={data?.applicationStatus === "running"}
									className="h-8 gap-1.5 text-sm"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<Rocket className="size-3.5 mr-1" />
												Deploy
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>
													Downloads the source code and performs a complete
													build
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}
						{canDeploy && (
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
								<Button
									variant="secondary"
									size="sm"
									isLoading={isReloading}
									className="h-8 gap-1.5 text-sm"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<RefreshCcw className="size-3.5 mr-1" />
												Reload
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Reload the application without rebuilding it</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}
						{canDeploy && (
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
									size="sm"
									isLoading={data?.applicationStatus === "running"}
									className="h-8 gap-1.5 text-sm"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<Hammer className="size-3.5 mr-1" />
												Rebuild
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>
													Only rebuilds the application without downloading new
													code
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						)}

						{canDeploy && data?.applicationStatus === "idle" ? (
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
								<Button
									variant="secondary"
									size="sm"
									isLoading={isStarting}
									className="h-8 gap-1.5 text-sm"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<CheckCircle2 className="size-3.5 mr-1" />
												Start
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>
													Start the application (requires a previous successful
													build)
												</p>
											</TooltipContent>
										</TooltipPrimitive.Portal>
									</Tooltip>
								</Button>
							</DialogAction>
						) : canDeploy ? (
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
								<Button
									variant="destructive"
									size="sm"
									isLoading={isStopping}
									className="h-8 gap-1.5 text-sm"
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="flex items-center">
												<Ban className="size-3.5 mr-1" />
												Stop
											</div>
										</TooltipTrigger>
										<TooltipPrimitive.Portal>
											<TooltipContent sideOffset={5} className="z-[60]">
												<p>Stop the currently running application</p>
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
					>
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 text-sm"
						>
							<Terminal className="size-3.5 mr-1" />
							Open Terminal
						</Button>
					</DockerTerminalModal>
					{canUpdateService && (
						<div className="flex flex-row items-center gap-2 rounded-md h-8 px-3 border border-border/50">
							<span className="text-sm font-medium text-muted-foreground">Autodeploy</span>
							<Switch
								aria-label="Toggle autodeploy"
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
								size="sm"
							/>
						</div>
					)}

					{canUpdateService && (
						<div className="flex flex-row items-center gap-2 rounded-md h-8 px-3 border border-border/50">
							<span className="text-sm font-medium text-muted-foreground">Clean Cache</span>
							<Switch
								aria-label="Toggle clean cache"
								checked={data?.cleanCache || false}
								onCheckedChange={async (enabled) => {
									await update({
										applicationId,
										cleanCache: enabled,
									})
										.then(async () => {
											toast.success("Clean Cache Updated");
											await refetch();
										})
										.catch(() => {
											toast.error("Error updating Clean Cache");
										});
								}}
								size="sm"
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
