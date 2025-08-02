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
							Servers
						</CardTitle>
						<CardDescription>
							Add servers to deploy your applications remotely.
						</CardDescription>

						{isCloud && (
							<span
								className="bg-gradient-to-r cursor-pointer from-blue-600 via-green-500 to-indigo-400 inline-block text-transparent bg-clip-text text-sm"
								onClick={() => {
									router.push("/dashboard/settings/servers?success=true");
								}}
							>
								Reset Onboarding
							</span>
						)}
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[25vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : (
							<>
								{sshKeys?.length === 0 && data?.length === 0 ? (
									<div className="flex flex-col items-center gap-3 min-h-[25vh] justify-center">
										<KeyIcon className="size-8" />
										<span className="text-base text-muted-foreground">
											No SSH Keys found. Add a SSH Key to start adding servers.{" "}
											<Link
												href="/dashboard/settings/ssh-keys"
												className="text-primary"
											>
												Add SSH Key
											</Link>
										</span>
									</div>
								) : (
									<>
										{data?.length === 0 ? (
											<div className="flex flex-col items-center gap-3  min-h-[25vh] justify-center">
												<ServerIcon className="size-8 self-center text-muted-foreground" />
												<span className="text-base text-muted-foreground">
													Start adding servers to deploy your applications
													remotely.
												</span>
												<HandleServers />
											</div>
										) : (
											<div className="flex flex-col gap-4  min-h-[25vh]">
												<Table>
													<TableCaption>
														<div className="flex flex-col  gap-4">
															See all servers
														</div>
													</TableCaption>
													<TableHeader>
														<TableRow>
															<TableHead className="text-left">Name</TableHead>
															{isCloud && (
																<TableHead className="text-center">
																	Status
																</TableHead>
															)}
															<TableHead className="text-center">
																IP Address
															</TableHead>
															<TableHead className="text-center">
																Port
															</TableHead>
															<TableHead className="text-center">
																Username
															</TableHead>
															<TableHead className="text-center">
																SSH Key
															</TableHead>
															<TableHead className="text-center">
																Created
															</TableHead>
															<TableHead className="text-right">
																Actions
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{data?.map((server) => {
															const canDelete = server.totalSum === 0;
															const isActive = server.serverStatus === "active";
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
																			{server.sshKeyId ? "Yes" : "No"}
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
																						Open menu
																					</span>
																					<MoreHorizontal className="h-4 w-4" />
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent align="end">
																				<DropdownMenuLabel>
																					Actions
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

																						{server.sshKeyId && (
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
																							? "Delete Server"
																							: "Server has active services"
																					}
																					description={
																						canDelete ? (
																							"This will delete the server and all associated data"
																						) : (
																							<div className="flex flex-col gap-2">
																								You can not delete this server
																								because it has active services.
																								<AlertBlock type="warning">
																									You have active services
																									associated with this server,
																									please delete them first.
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
																									`Server ${server.name} deleted successfully`,
																								);
																							})
																							.catch((err) => {
																								toast.error(err.message);
																							});
																					}}
																				>
																					<DropdownMenuItem
																						className="w-full cursor-pointer text-red-500 hover:!text-red-600"
																						onSelect={(e) => e.preventDefault()}
																					>
																						Delete Server
																					</DropdownMenuItem>
																				</DialogAction>

																				{isActive && server.sshKeyId && (
																					<>
																						<DropdownMenuSeparator />
																						<DropdownMenuLabel>
																							Extra
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
																									server?.metricsConfig?.server
																										?.token
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
