import {
	Boxes,
	HelpCircle,
	Loader2,
	LockIcon,
	MoreHorizontal,
} from "lucide-react";
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

export const ShowNodes = ({ serverId }: Props) => {
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
								Cluster
							</CardTitle>
							<CardDescription>Add nodes to your cluster</CardDescription>
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
										A list of your managers / workers.
									</TableCaption>
									<TableHeader>
										<TableRow>
											<TableHead className="text-left">Hostname</TableHead>
											<TableHead className="text-right">Status</TableHead>
											<TableHead className="text-right">Role</TableHead>
											<TableHead className="text-right">Availability</TableHead>
											<TableHead className="text-right">
												Engine Version
											</TableHead>
											<TableHead className="text-right">Created</TableHead>

											<TableHead className="text-right">Actions</TableHead>
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
															Created{" "}
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
																<DropdownMenuLabel>Actions</DropdownMenuLabel>
																<ShowNodeData data={node} />
																{!node?.ManagerStatus?.Leader && (
																	<DialogAction
																		title="Delete Node"
																		description="Are you sure you want to delete this node from the cluster?"
																		type="destructive"
																		onClick={async () => {
																			await deleteNode({
																				nodeId: node.ID,
																				serverId,
																			})
																				.then(() => {
																					refetch();
																					toast.success(
																						"Node deleted successfully",
																					);
																				})
																				.catch(() => {
																					toast.error("Error deleting node");
																				});
																		}}
																	>
																		<DropdownMenuItem
																			onSelect={(e) => e.preventDefault()}
																		>
																			Delete
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
										To add nodes to your cluster, you need to configure at least
										one registry.
									</span>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger className="self-center">
												<HelpCircle className="size-5 text-muted-foreground " />
											</TooltipTrigger>
											<TooltipContent>
												Nodes need a registry to pull images from.
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>

								<ul className="list-disc list-inside text-sm text-muted-foreground border p-4 rounded-lg flex flex-col gap-1.5 mt-2.5">
									<li>
										<strong>Docker Registry:</strong> Use custom registries like
										Docker Hub, DigitalOcean Registry, etc.
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
