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
import {
	Boxes,
	HelpCircle,
	Loader2,
	LockIcon,
	MoreHorizontal,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";
import { AddNode } from "./add-node";
import { ShowNodeData } from "./show-node-data";

interface Props {
	serverId?: string;
}

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
								{t("settings.cluster.title")}
							</CardTitle>
							<CardDescription>
								{t("settings.cluster.description")}
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
										{t("settings.cluster.table.caption")}
									</TableCaption>
									<TableHeader>
										<TableRow>
											<TableHead className="text-left">
												{t("settings.cluster.table.hostname")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.table.status")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.table.role")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.table.availability")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.table.engineVersion")}
											</TableHead>
											<TableHead className="text-right">
												{t("settings.cluster.table.created")}
											</TableHead>

											<TableHead className="text-right">
												{t("settings.cluster.table.actions")}
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
														{node.Status.State}
													</TableCell>
													<TableCell className="text-right">
														<Badge
															variant={isManager ? "default" : "secondary"}
														>
															{node?.Spec?.Role}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														{node.Spec.Availability}
													</TableCell>

													<TableCell className="text-right">
														{node?.Description.Engine.EngineVersion}
													</TableCell>

													<TableCell className="text-right">
														<DateTooltip
															date={node.CreatedAt}
															className="text-sm"
														>
															{t("settings.cluster.table.createdText")}{" "}
														</DateTooltip>
													</TableCell>
													<TableCell className="text-right flex justify-end">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" className="h-8 w-8 p-0">
																	<span className="sr-only">Open menu</span>
																	<MoreHorizontal className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuLabel>
																	{t("settings.cluster.actions.title")}
																</DropdownMenuLabel>
																<ShowNodeData data={node} />
																{!node?.ManagerStatus?.Leader && (
																	<DialogAction
																		title={t("settings.cluster.delete.title")}
																		description={t(
																			"settings.cluster.delete.description",
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
																							"settings.cluster.delete.success",
																						),
																					);
																				})
																				.catch(() => {
																					toast.error(
																						t("settings.cluster.delete.error"),
																					);
																				});
																		}}
																	>
																		<DropdownMenuItem
																			onSelect={(e) => e.preventDefault()}
																		>
																			{t("settings.cluster.delete.action")}
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
										{t("settings.cluster.noRegistry.title")}
									</span>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger className="self-center">
												<HelpCircle className="size-5 text-muted-foreground " />
											</TooltipTrigger>
											<TooltipContent>
												{t("settings.cluster.noRegistry.tooltip")}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>

								<ul className="list-disc list-inside text-sm text-muted-foreground border p-4 rounded-lg flex flex-col gap-1.5 mt-2.5">
									<li>
										<strong>
											{t("settings.cluster.noRegistry.dockerRegistry")}
										</strong>
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
