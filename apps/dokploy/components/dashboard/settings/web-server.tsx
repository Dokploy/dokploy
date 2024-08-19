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
import React from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
				<CardTitle className="text-xl">Web server settings</CardTitle>
				<CardDescription>Reload or clean the web server.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="grid md:grid-cols-2 gap-4">
					<DropdownMenu>
						<DropdownMenuTrigger asChild disabled={isLoading}>
							<Button isLoading={isLoading} variant="outline">
								Server
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="start">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={async () => {
										await reloadServer()
											.then(async () => {
												toast.success("Server Reloaded");
											})
											.catch(() => {
												toast.success("Server Reloaded");
											});
									}}
								>
									<span>Reload</span>
								</DropdownMenuItem>
								<ShowModalLogs appName="dokploy">
									<span>Watch logs</span>
								</ShowModalLogs>

								<ShowServerTraefikConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>View Traefik config</span>
									</DropdownMenuItem>
								</ShowServerTraefikConfig>

								<ShowServerMiddlewareConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>View middlewares config</span>
									</DropdownMenuItem>
								</ShowServerMiddlewareConfig>

								<TerminalModal>
									<span>Enter the terminal</span>
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
								Traefik
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="start">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={async () => {
										await reloadTraefik()
											.then(async () => {
												toast.success("Traefik Reloaded");
											})
											.catch(() => {
												toast.error("Error to reload the traefik");
											});
									}}
								>
									<span>Reload</span>
								</DropdownMenuItem>
								<ShowModalLogs appName="dokploy-traefik">
									<span>Watch logs</span>
								</ShowModalLogs>
								<ShowMainTraefikConfig>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>View Traefik config</span>
									</DropdownMenuItem>
								</ShowMainTraefikConfig>
								<EditTraefikEnv>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="w-full cursor-pointer space-x-3"
									>
										<span>Modify Env</span>
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
										<span>Enter the terminal</span>
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
								Space
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-64" align="start">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanUnusedImages()
											.then(async () => {
												toast.success("Cleaned images");
											})
											.catch(() => {
												toast.error("Error to clean images");
											});
									}}
								>
									<span>Clean unused images</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanUnusedVolumes()
											.then(async () => {
												toast.success("Cleaned volumes");
											})
											.catch(() => {
												toast.error("Error to clean volumes");
											});
									}}
								>
									<span>Clean unused volumes</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanStoppedContainers()
											.then(async () => {
												toast.success("Stopped containers cleaned");
											})
											.catch(() => {
												toast.error("Error to clean stopped containers");
											});
									}}
								>
									<span>Clean stopped containers</span>
								</DropdownMenuItem>

								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanDockerBuilder()
											.then(async () => {
												toast.success("Cleaned Docker Builder");
											})
											.catch(() => {
												toast.error("Error to clean Docker Builder");
											});
									}}
								>
									<span>Clean Docker Builder & System</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanMonitoring()
											.then(async () => {
												toast.success("Cleaned Monitoring");
											})
											.catch(() => {
												toast.error("Error to clean Monitoring");
											});
									}}
								>
									<span>Clean Monitoring </span>
								</DropdownMenuItem>
								<DropdownMenuItem
									className="w-full cursor-pointer"
									onClick={async () => {
										await cleanAll()
											.then(async () => {
												toast.success("Cleaned all");
											})
											.catch(() => {
												toast.error("Error to clean all");
											});
									}}
								>
									<span>Clean all</span>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<UpdateServer />
				</div>

				<div className="flex items-center flex-wrap justify-between gap-4">
					<span className="text-sm text-muted-foreground">
						Server IP: {data?.serverIp}
					</span>
					<span className="text-sm text-muted-foreground">
						Version: {dokployVersion}
					</span>
					<div className="flex items-center gap-4">
						<Switch
							checked={data?.enableDockerCleanup}
							onCheckedChange={async (e) => {
								await updateDockerCleanup({
									enableDockerCleanup: e,
								})
									.then(async () => {
										toast.success("Docker Cleanup Enabled");
									})
									.catch(() => {
										toast.error("Docker Cleanup Error");
									});

								refetch();
							}}
						/>
						<Label className="text-primary">Daily Docker Cleanup</Label>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};
