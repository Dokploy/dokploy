import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import i18n from "@/i18n";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { DockerTerminalModal } from "./web-server/docker-terminal-modal";
import { EditTraefikEnv } from "./web-server/edit-traefik-env";
import { ShowMainTraefikConfig } from "./web-server/show-main-traefik-config";
import { ShowModalLogs } from "./web-server/show-modal-logs";
import { ShowServerMiddlewareConfig } from "./web-server/show-server-middleware-config";
import { ShowServerTraefikConfig } from "./web-server/show-server-traefik-config";
import { TerminalModal } from "./web-server/terminal-modal";
import { UpdateServer } from "./web-server/update-server";

export const WebServer = () => {
	const { data, refetch } = api.admin.one.useQuery();
	const { mutateAsync: reloadServer, isLoading } =
		api.settings.reloadServer.useMutation();
	const { mutateAsync: reloadTraefik, isLoading: reloadTraefikIsLoading } =
		api.settings.reloadTraefik.useMutation();
	const { mutateAsync: cleanAll, isLoading: cleanAllIsLoading } =
		api.settings.cleanAll.useMutation();
	const { mutateAsync: toggleDashboard, isLoading: toggleDashboardIsLoading } =
		api.settings.toggleDashboard.useMutation();

	const {
		mutateAsync: cleanDockerBuilder,
		isLoading: cleanDockerBuilderIsLoading,
	} = api.settings.cleanDockerBuilder.useMutation();

	const { mutateAsync: cleanMonitoring, isLoading: cleanMonitoringIsLoading } =
		api.settings.cleanMonitoring.useMutation();
	const {
		mutateAsync: cleanUnusedImages,
		isLoading: cleanUnusedImagesIsLoading,
	} = api.settings.cleanUnusedImages.useMutation();

	const {
		mutateAsync: cleanUnusedVolumes,
		isLoading: cleanUnusedVolumesIsLoading,
	} = api.settings.cleanUnusedVolumes.useMutation();

	const {
		mutateAsync: cleanStoppedContainers,
		isLoading: cleanStoppedContainersIsLoading,
	} = api.settings.cleanStoppedContainers.useMutation();

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();

	const { mutateAsync: updateDockerCleanup } =
		api.settings.updateDockerCleanup.useMutation();

	const { data: haveTraefikDashboardPortEnabled, refetch: refetchDashboard } =
		api.settings.haveTraefikDashboardPortEnabled.useQuery();

	return (
		<Card className="rounded-lg w-full bg-transparent">
			<CardHeader>
				<CardTitle className="text-xl">{i18n.getText('PAGE.webServerSettings.title')}</CardTitle>
				<CardDescription>{i18n.getText('PAGE.webServerSettings.description')}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid md:grid-cols-2 gap-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild disabled={isLoading}>
							<Button isLoading={isLoading} variant="outline">
								{i18n.getText('PAGE.webServerSettings.serverButton')}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="start">
							<DropdownMenuLabel>{i18n.getText('PAGE.webServerSettings.actions')}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={async () => {
										await reloadServer()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.serverReloadedSuccess'));
											})
											.catch(() => {
												toast.success(i18n.getText('PAGE.webServerSettings.serverReloadedError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.reloadServer')}</span>
								</DropdownMenuItem>
								<ShowModalLogs appName="dokploy">
									<span>{i18n.getText('PAGE.webServerSettings.watchLogs')}</span>
								</ShowModalLogs>

								<ShowServerTraefikConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>{i18n.getText('PAGE.webServerSettings.viewTraefikConfig')}</span>
									</DropdownMenuItem>
								</ShowServerTraefikConfig>

								<ShowServerMiddlewareConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>{i18n.getText('PAGE.webServerSettings.viewMiddlewaresConfig')}</span>
									</DropdownMenuItem>
								</ShowServerMiddlewareConfig>

								<TerminalModal>
									<span>{i18n.getText('PAGE.webServerSettings.enterTerminal')}</span>
								</TerminalModal>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger
							asChild
							disabled={reloadTraefikIsLoading || toggleDashboardIsLoading}
						>
							<Button
								isLoading={reloadTraefikIsLoading || toggleDashboardIsLoading}
								variant="outline"
							>
								{i18n.getText('PAGE.webServerSettings.traefikButton')}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="start">
							<DropdownMenuLabel>{i18n.getText('PAGE.webServerSettings.actions')}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={async () => {
										await reloadTraefik()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.title'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.traefikReloadedError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.reloadTraefik')}</span>
								</DropdownMenuItem>
								<ShowModalLogs appName="dokploy-traefik">
									<span>{i18n.getText('PAGE.webServerSettings.watchLogs')}</span>
								</ShowModalLogs>
								<ShowMainTraefikConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>{i18n.getText('PAGE.webServerSettings.viewTraefikConfig')}</span>
									</DropdownMenuItem>
								</ShowMainTraefikConfig>
								<EditTraefikEnv>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>{i18n.getText('PAGE.webServerSettings.modifyEnv')}</span>
									</DropdownMenuItem>
								</EditTraefikEnv>

								<DropdownMenuItem
									onClick={async () => {
										await toggleDashboard({
											enableDashboard: !haveTraefikDashboardPortEnabled,
										})
											.then(async () => {
												toast.success(
													`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
												);
												refetchDashboard();
											})
											.catch(() => {
												toast.error(
													`${haveTraefikDashboardPortEnabled ? "Disabled" : "Enabled"} Dashboard`,
												);
											});
									}}
									className="w-full cursor-pointer space-x-3"
								>
									<span>
										{haveTraefikDashboardPortEnabled ? "Disable" : "Enable"}{" "}
										Dashboard
									</span>
								</DropdownMenuItem>

								<DockerTerminalModal appName="dokploy-traefik">
									<DropdownMenuItem
										className="w-full cursor-pointer space-x-3"
										onSelect={(e) => e.preventDefault()}
									>
										<span>{i18n.getText('PAGE.webServerSettings.enterTerminal')}</span>
									</DropdownMenuItem>
								</DockerTerminalModal>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger
							asChild
							disabled={
								cleanAllIsLoading ||
								cleanDockerBuilderIsLoading ||
								cleanUnusedImagesIsLoading ||
								cleanUnusedVolumesIsLoading ||
								cleanStoppedContainersIsLoading
							}
						>
							<Button
								isLoading={
									cleanAllIsLoading ||
									cleanDockerBuilderIsLoading ||
									cleanUnusedImagesIsLoading ||
									cleanUnusedVolumesIsLoading ||
									cleanStoppedContainersIsLoading
								}
								variant="outline"
							>
								{i18n.getText('PAGE.webServerSettings.spaceButton')}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-64" align="start">
							<DropdownMenuLabel>{i18n.getText('PAGE.webServerSettings.actions')}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanUnusedImages()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedImagesSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedImagesError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanUnusedImages')}</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanUnusedVolumes()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedVolumesSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedVolumesError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanUnusedVolumes')}</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanStoppedContainers()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedStoppedContainersSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedStoppedContainersError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanStoppedContainers')}</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanDockerBuilder()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedDockerBuilderSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedDockerBuilderError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanDockerBuilder')}</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanMonitoring()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedMonitoringSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedMonitoringError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanMonitoring')}</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanAll()
											.then(async () => {
												toast.success(i18n.getText('PAGE.webServerSettings.cleanedAllSuccess'));
											})
											.catch(() => {
												toast.error(i18n.getText('PAGE.webServerSettings.cleanedAllError'));
											});
									}}
								>
									<span>{i18n.getText('PAGE.webServerSettings.cleanAll')}</span>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<UpdateServer />
				</div>

				<div className="flex items-center flex-wrap justify-between gap-4">
					<span className="text-sm text-muted-foreground">
						{i18n.getText('PAGE.webServerSettings.serverIp', {
							serverIp: data?.serverIp
						})}
					</span>
					<span className="text-sm text-muted-foreground">
						{i18n.getText('PAGE.webServerSettings.version', {
							dokployVersion: dokployVersion
						})}
					</span>
					<div className="flex items-center gap-4">
						<Switch
							checked={data?.enableDockerCleanup}
							onCheckedChange={async (e) => {
								await updateDockerCleanup({
									enableDockerCleanup: e,
								})
									.then(async () => {
										toast.success(i18n.getText('PAGE.webServerSettings.dockerCleanupEnabled'));
									})
									.catch(() => {
										toast.error(i18n.getText('PAGE.webServerSettings.dockerCleanupError'));
									});

								refetch();
							}}
						/>
						<Label className="text-primary">{i18n.getText('PAGE.webServerSettings.dailyDockerCleanup')}</Label>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
