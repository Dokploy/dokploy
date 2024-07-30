import { DateTooltip } from "@/components/shared/date-tooltip";
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
import { HelpCircle, LockIcon, MoreHorizontal } from "lucide-react";
import React from "react";
import { AddNode } from "./add-node";
import { ShowNodeData } from "./show-node-data";
import { DeleteWorker } from "./workers/delete-worker";

export const ShowNodes = () => {
	const { data, isLoading } = api.cluster.getNodes.useQuery();
	const { data: registry } = api.registry.all.useQuery();

	const haveAtLeastOneRegistry = !!(registry && registry?.length > 0);
	return (
		<Card className="bg-transparent h-full">
			<CardHeader className="flex flex-row gap-2 justify-between w-full items-center flex-wrap">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-xl">Cluster</CardTitle>
					<CardDescription>Add nodes to your cluster</CardDescription>
				</div>
				{haveAtLeastOneRegistry && (
					<div className="flex flex-row gap-2">
						<AddNode />
					</div>
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{haveAtLeastOneRegistry ? (
					<div className="grid md:grid-cols-1 gap-4">
						{isLoading && <div>Loading...</div>}
						<Table>
							<TableCaption>A list of your managers / workers.</TableCaption>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[100px]">Hostname</TableHead>
									<TableHead className="text-right">Status</TableHead>
									<TableHead className="text-right">Role</TableHead>
									<TableHead className="text-right">Availability</TableHead>
									<TableHead className="text-right">Engine Version</TableHead>
									<TableHead className="text-right">Created</TableHead>

									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data?.map((node) => {
									const isManager = node.Spec.Role === "manager";
									return (
										<TableRow key={node.ID}>
											<TableCell className="w-[100px]">
												{node.Description.Hostname}
											</TableCell>
											<TableCell className="text-right">
												{node.Status.State}
											</TableCell>
											<TableCell className="text-right">
												<Badge variant={isManager ? "default" : "secondary"}>
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
												<DateTooltip date={node.CreatedAt} className="text-sm">
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
															<DeleteWorker nodeId={node.ID} />
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
								To add nodes to your cluster, you need to configure at least one
								registry.
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
							<li>
								<strong>Self-Hosted Docker Registry:</strong> Automatically set
								up a local registry to store all images.
							</li>
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
