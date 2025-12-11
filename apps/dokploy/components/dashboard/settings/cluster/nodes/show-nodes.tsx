import {
	Boxes,
	HelpCircle,
	Loader2,
	LockIcon,
	MoreHorizontal,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { DateTooltip } from "@/components/shared/date-tooltip";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { AddNode } from "./add-node";
import { ShowNodeData } from "./show-node-data";

interface Props {
	serverId?: string;
}

const getNodeStatusLabel = (status: string, t: (key: string) => string) => {
	const statusMap: Record<string, string> = {
		Ready: t("settings.cluster.nodes.status.ready"),
		Down: t("settings.cluster.nodes.status.down"),
		Unknown: t("settings.cluster.nodes.status.unknown"),
		Disconnected: t("settings.cluster.nodes.status.disconnected"),
	};
	return statusMap[status] || status;
};

const getNodeRoleLabel = (role: string, t: (key: string) => string) => {
	const roleMap: Record<string, string> = {
		manager: t("settings.cluster.nodes.role.manager"),
		worker: t("settings.cluster.nodes.role.worker"),
	};
	return roleMap[role] || role;
};

const getAvailabilityLabel = (
	availability: string,
	t: (key: string) => string,
) => {
	const availabilityMap: Record<string, string> = {
		active: t("common:swarm.nodes.availability.active"),
		pause: t("common:swarm.nodes.availability.pause"),
		drain: t("common:swarm.nodes.availability.drain"),
	};
	return availabilityMap[availability?.toLowerCase?.() ?? ""] || availability;
};

export const ShowNodes = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data, isLoading, refetch } = api.cluster.getNodes.useQuery({
		serverId,
	});
	const { data: registry } = api.registry.all.useQuery();

	const { mutateAsync: deleteNode } = api.cluster.removeWorker.useMutation();

	const haveAtLeastOneRegistry = !!(registry && registry?.length > 0);
	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar  p-2.5 rounded-xl  max-w-5xl mx-auto">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="flex flex-row gap-2 justify-between w-full items-center flex-wrap">
						<div className="flex flex-col gap-2">
							<CardTitle className="text-xl flex flex-row gap-2">
								<Boxes className="size-6 text-muted-foreground self-center" />
								{t("settings.cluster.page.title")}
							</CardTitle>
							<CardDescription>
								{t("settings.cluster.page.description")}
							</CardDescription>
						</div>
						{haveAtLeastOneRegistry && (
							<div className="flex flex-row gap-2">
								<AddNode serverId={serverId} />
							</div>
						)}
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t min-h-[35vh]">
						{isLoading ? (
							<div className="flex items-center justify-center w-full h-[40vh]">
								<Loader2 className="size-8 animate-spin text-muted-foreground" />
							</div>
						) : haveAtLeastOneRegistry ? (
							<div className="grid md:grid-cols-1 gap-4">
								<Table>
									<TableCaption>
										{t("settings.cluster.nodes.table.caption")}
									</TableCaption>
									<TableHeader>
										<TableRow>
											<TableHead className="text-left">
												{t("settings.cluster.nodes.table.hostname")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.status")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.role")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.availability")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.engineVersion")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.created")}
											</TableHead>

											<TableHead className="text-right">
												{t("settings.cluster.nodes.table.actions")}
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{data?.map((node) => {
											const isManager = node.Spec.Role === "manager";
											return (
												<TableRow key={node.ID}>
													<TableCell className="text-left">
														{node.Description.Hostname}
													</TableCell>
													<TableCell className="text-right">
														{getNodeStatusLabel(node.Status.State, t)}
													</TableCell>
													<TableCell className="text-right">
														<Badge
															variant={isManager ? "default" : "secondary"}
														>
															{getNodeRoleLabel(node?.Spec?.Role || "", t)}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														{getAvailabilityLabel(node.Spec.Availability, t)}
													</TableCell>

													<TableCell className="text-right">
														{node?.Description.Engine.EngineVersion}
													</TableCell>

													<TableCell className="text-right">
														<DateTooltip
															date={node.CreatedAt}
															className="text-sm"
														>
															{t("settings.cluster.nodes.table.created")}{" "}
														</DateTooltip>
													</TableCell>
													<TableCell className="text-right flex justify-end">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" className="h-8 w-8 p-0">
																	<span className="sr-only">
																		{t("settings.common.openMenu")}
																	</span>
																	<MoreHorizontal className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuLabel>
																	{t("settings.cluster.nodes.table.actions")}
																</DropdownMenuLabel>
																<ShowNodeData data={node} />
																{!node?.ManagerStatus?.Leader && (
																	<DialogAction
																		title={t(
																			"settings.cluster.nodes.delete.title",
																		)}
																		description={t(
																			"settings.cluster.nodes.delete.description",
																		)}
																		type="destructive"
																		onClick={async () => {
																			await deleteNode({
																				nodeId: node.ID,
																				serverId,
																			})
																				.then(() => {
																					refetch();
																					toast.success(
																						t(
																							"settings.cluster.nodes.delete.success",
																						),
																					);
																				})
																				.catch(() => {
																					toast.error(
																						t(
																							"settings.cluster.nodes.delete.error",
																						),
																					);
																				});
																		}}
																	>
																		<DropdownMenuItem
																			onSelect={(e) => e.preventDefault()}
																		>
																			{t("settings.cluster.nodes.menu.delete")}
																		</DropdownMenuItem>
																	</DialogAction>
																)}
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						) : (
							<div className="flex flex-col items-center gap-3">
								<LockIcon className="size-8 text-muted-foreground" />
								<div className="flex flex-row gap-2">
									<span className="text-base text-muted-foreground ">
										{t("settings.cluster.nodes.requireRegistry.description")}
									</span>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger className="self-center">
												<HelpCircle className="size-5 text-muted-foreground " />
											</TooltipTrigger>
											<TooltipContent>
												{t("settings.cluster.nodes.requireRegistry.tooltip")}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>

								<ul className="list-disc list-inside text-sm text-muted-foreground border p-4 rounded-lg flex flex-col gap-1.5 mt-2.5">
									<li>
										{t("settings.cluster.nodes.requireRegistry.dockerRegistry")}
									</li>
								</ul>
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
