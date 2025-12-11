import { format } from "date-fns";
import { KeyIcon, Loader2, MoreHorizontal, ServerIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { ShowNodesModal } from "../cluster/nodes/show-nodes-modal";
import { TerminalModal } from "../web-server/terminal-modal";
import { ShowServerActions } from "./actions/show-server-actions";
import { HandleServers } from "./handle-servers";
import { SetupServer } from "./setup-server";
import { ShowDockerContainersModal } from "./show-docker-containers-modal";
import { ShowMonitoringModal } from "./show-monitoring-modal";
import { ShowSchedulesModal } from "./show-schedules-modal";
import { ShowSwarmOverviewModal } from "./show-swarm-overview-modal";
import { ShowTraefikFileSystemModal } from "./show-traefik-file-system-modal";
import { WelcomeSuscription } from "./welcome-stripe/welcome-suscription";

export const ShowServers = () => {
	const { t } = useTranslation("settings");
	const router = useRouter();
	const query = router.query;
	const { data, refetch, isLoading } = api.server.all.useQuery();
	const { mutateAsync } = api.server.remove.useMutation();
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: canCreateMoreServers } =
		api.stripe.canCreateMoreServers.useQuery();

	return (
		<div className="w-full">
			{query?.success && isCloud && <WelcomeSuscription />}
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<ServerIcon className="size-6 text-muted-foreground self-center" />
							{t("settings.servers.page.title")}
						</CardTitle>
						<CardDescription>
							{t("settings.servers.page.description")}
						</CardDescription>

						{isCloud && (
							<span
								className="bg-gradient-to-r cursor-pointer from-blue-600 via-green-500 to-indigo-400 inline-block text-transparent bg-clip-text text-sm"
								onClick={() => {
									router.push("/dashboard/settings/servers?success=true");
								}}
							>
								{t("settings.servers.page.resetOnboarding")}
							</span>
						)}
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>{t("settings.common.loading")}</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{sshKeys?.length === 0 && data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<KeyIcon className="size-8" />
										<span className="text-base text-muted-foreground">
											{t("settings.servers.page.emptyNoSSHKeys")} {" "}
											<Link
												href="/dashboard/settings/ssh-keys"
												className="text-primary"
											>
												{t("settings.servers.page.addSshKey")}
											</Link>
										</span>
									</div>
								) : (
									<>
										{data?.length === 0 ? (
											<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
												<ServerIcon className="size-8 self-center text-muted-foreground" />
												<span className="text-base text-muted-foreground">
													{t("settings.servers.page.emptyNoServers")}
												</span>
												<HandleServers />
											</div>
										) : (
											<div className="flex flex-col gap-4  min-h-[25vh]">
												<Table>
													<TableCaption>
														<div className="flex flex-col  gap-4">
															{t("settings.servers.table.caption")}
														</div>
													</TableCaption>
													<TableHeader>
														<TableRow>
															<TableHead className="text-left">
																{t("settings.servers.table.name")}
															</TableHead>
															{isCloud && (
																<TableHead className="text-center">
																	{t("settings.servers.table.status")}
																</TableHead>
															)}
															<TableHead className="text-center">
																{t("settings.servers.table.type")}
															</TableHead>
															<TableHead className="text-center">
																{t("settings.servers.table.ipAddress")}
															</TableHead>
															<TableHead className="text-center">
																{t("settings.servers.table.port")}
															</TableHead>
															<TableHead className="text-center">
																{t("settings.servers.table.username")}
															</TableHead>
															<TableHead className="text-center">
																{t("settings.servers.table.sshKey")}
															</TableHead>
															<TableHead className="text-center">
																{t("settings.servers.table.created")}
															</TableHead>
															<TableHead className="text-right">
																{t("settings.servers.table.actions")}
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{data?.map((server) => {
															const canDelete = server.totalSum === 0;
															const isActive = server.serverStatus === "active";
															const isBuildServer =
																server.serverType === "build";
															return (
																<TableRow key={server.serverId}>
																	<TableCell className="text-left">
																		{server.name}
																	</TableCell>
																	{isCloud && (
																		<TableHead className="text-center">
																			<Badge
																				variant={
																					server.serverStatus === "active"
																						? "default"
																						: "destructive"
																				}
																			>
																				{server.serverStatus}
																			</Badge>
																		</TableHead>
																	)}
																	<TableCell className="text-center">
																		<Badge
																			variant={
																				isBuildServer ? "secondary" : "default"
																			}
																		>
																			{server.serverType}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-center">
																		<Badge>{server.ipAddress}</Badge>
																	</TableCell>
																	<TableCell className="text-center">
																		{server.port}
																	</TableCell>
																	<TableCell className="text-center">
																		{server.username}
																	</TableCell>
																	<TableCell className="text-right">
																		<span className="text-sm text-muted-foreground">
																			{server.sshKeyId
																				? t("settings.common.yes")
																				: t("settings.common.no")}
																		</span>
																	</TableCell>
																	<TableCell className="text-right">
																		<span className="text-sm text-muted-foreground">
																			{format(
																				new Date(server.createdAt),
																				"PPpp",
																			)}
																		</span>
																	</TableCell>

																	<TableCell className="text-right flex justify-end">
																		<DropdownMenu>
																			<DropdownMenuTrigger asChild>
																				<Button
																					variant="ghost"
																					className="h-8 w-8 p-0"
																				>
																					<span className="sr-only">
																						{t("settings.common.openMenu")}
																					</span>
																					<MoreHorizontal className="h-4 w-4" />
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent align="end">
																				<DropdownMenuLabel>
																					{t("settings.servers.table.actions")}
																				</DropdownMenuLabel>

																				{isActive && (
																					<>
																						{server.sshKeyId && (
																							<TerminalModal
																								serverId={server.serverId}
																							>
																								<span>
																									{t(
																										"settings.common.enterTerminal",
																									)}
																								</span>
																							</TerminalModal>
																						)}
																						<SetupServer
																							serverId={server.serverId}
																						/>

																						<HandleServers
																							serverId={server.serverId}
																						/>

																						{server.sshKeyId &&
																							!isBuildServer && (
																								<ShowServerActions
																									serverId={server.serverId}
																								/>
																							)}
																					</>
																				)}

																				<DialogAction
																					disabled={!canDelete}
																					title={
																						canDelete
																							? t("settings.servers.delete.title")
																							: t("settings.servers.delete.blockedTitle")
																					}
																					description={
																						canDelete ? (
																									t("settings.servers.delete.description")
																						) : (
																									<div className="flex flex-col gap-2">
																										{t("settings.servers.delete.blockedDescription")}
																										<AlertBlock type="warning">
																											{t("settings.servers.delete.blockedAlert")}
																										</AlertBlock>
																									</div>
																						)
																					}
																					onClick={async () => {
																						await mutateAsync({
																							serverId: server.serverId,
																						})
																							.then(() => {
																								refetch();
																								toast.success(
																									t("settings.servers.delete.success", {
																										name: server.name,
																									}),
																								);
																							})
																							.catch(() => {
																								toast.error(t("settings.servers.delete.error"));
																							});
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																						onSelect={(e) => e.preventDefault()}
																					>
																						{t("settings.servers.delete.title")}
																					</DropdownMenuItem>
																				</DialogAction>

																				{isActive &&
																					server.sshKeyId &&
																					!isBuildServer && (
																						<>
																							<DropdownMenuSeparator />
																							<DropdownMenuLabel>
																								{t("settings.servers.menu.extra")}
																							</DropdownMenuLabel>

																							<ShowTraefikFileSystemModal
																								serverId={server.serverId}
																							/>
																							<ShowDockerContainersModal
																								serverId={server.serverId}
																							/>
																							{isCloud && (
																								<ShowMonitoringModal
																									url={`http://${server.ipAddress}:${server?.metricsConfig?.server?.port}/metrics`}
																									token={
																										server?.metricsConfig
																											?.server?.token
																									}
																								/>
																							)}

																							<ShowSwarmOverviewModal
																								serverId={server.serverId}
																							/>
																							<ShowNodesModal
																								serverId={server.serverId}
																							/>

																							<ShowSchedulesModal
																								serverId={server.serverId}
																							/>
																						</>
																					)}
																			</DropdownMenuContent>
																		</DropdownMenu>
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>

												<div className="flex flex-row gap-2 flex-wrap w-full justify-end mr-4">
													{data && data?.length > 0 && (
														<div>
															<HandleServers />
														</div>
													)}
												</div>
											</div>
										)}
									</>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
