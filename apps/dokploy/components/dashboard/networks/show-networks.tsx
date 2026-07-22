"use client";

import { Loader2, Network, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HandleNetwork } from "@/components/dashboard/networks/handle-network";
import { ShowNetworkConfig } from "@/components/dashboard/networks/show-network-config";
import { SyncNetworks } from "@/components/dashboard/networks/sync-networks";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

interface Props {
	/** Selected server; undefined shows the local Dokploy server */
	serverId?: string;
}

export const ShowNetworks = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const { data: networks, isLoading } = api.network.all.useQuery({ serverId });
	const { mutateAsync: removeNetwork } = api.network.remove.useMutation();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Network className="size-6 text-muted-foreground self-center" />
							Networks
						</CardTitle>
						<CardDescription>
							Manage the Docker networks of the selected server.
						</CardDescription>
						<CardAction className="self-center">
							<div className="flex items-center gap-2">
								<SyncNetworks serverId={serverId} />
								{networks && networks.length > 0 && (
									<HandleNetwork serverId={serverId} />
								)}
							</div>
						</CardAction>
					</CardHeader>

					<CardContent className="space-y-2 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[45vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !networks?.length ? (
							<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
								<div className="rounded-full bg-muted p-4">
									<Network className="size-10 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium">No networks yet</p>
									<p className="max-w-sm text-sm text-muted-foreground">
										Create Docker networks for your organization and optionally
										attach them to a server. Add your first network to get
										started.
									</p>
								</div>
								<HandleNetwork serverId={serverId} />
							</div>
						) : (
							<div className="rounded-md border overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Driver</TableHead>
											<TableHead>Subnet</TableHead>
											<TableHead>Internal</TableHead>
											<TableHead>Attachable</TableHead>
											<TableHead>Created</TableHead>
											<TableHead className="w-[100px] text-right">
												Actions
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{networks.map((n) => {
											const ipamEntries = (n.ipam?.config ?? []).filter(
												(c) => c.subnet || c.gateway || c.ipRange,
											);
											return (
												<TableRow key={n.networkId}>
													<TableCell className="font-medium">
														{n.name}
													</TableCell>
													<TableCell>
														<div className="flex items-center gap-2">
															<Badge variant="outline">{n.driver}</Badge>
															<span className="text-xs text-muted-foreground">
																{n.driver === "overlay" ? "swarm" : "local"}
															</span>
														</div>
													</TableCell>
													<TableCell>
														{ipamEntries.length > 0 ? (
															<div className="flex flex-col gap-1">
																{ipamEntries.map((c, index) => (
																	<div
																		key={`${n.networkId}-ipam-${index}`}
																		className="flex flex-col"
																	>
																		<span>{c.subnet ?? "—"}</span>
																		{(c.gateway || c.ipRange) && (
																			<span className="text-xs text-muted-foreground">
																				{[
																					c.gateway && `gw ${c.gateway}`,
																					c.ipRange && `range ${c.ipRange}`,
																				]
																					.filter(Boolean)
																					.join(" · ")}
																			</span>
																		)}
																	</div>
																))}
															</div>
														) : (
															<span className="text-muted-foreground">
																Auto
															</span>
														)}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{n.internal ? "Yes" : "No"}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{n.attachable ? "Yes" : "No"}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{new Date(n.createdAt).toLocaleDateString()}
													</TableCell>
													<TableCell>
														<div className="flex items-center justify-end gap-3">
															<ShowNetworkConfig
																networkId={n.networkId}
																networkName={n.name}
															/>
															<DialogAction
																title="Delete network"
																description={`The network "${n.name}" will be removed from Docker and Dokploy. This action cannot be undone.`}
																onClick={async () => {
																	try {
																		await removeNetwork({
																			networkId: n.networkId,
																		});
																		toast.success("Network deleted");
																		await utils.network.all.invalidate();
																	} catch (error) {
																		toast.error("Error deleting network", {
																			description:
																				error instanceof Error
																					? error.message
																					: "Unknown error",
																		});
																	}
																}}
															>
																<Button
																	variant="ghost"
																	size="icon-sm"
																	aria-label="Delete network"
																>
																	<Trash2 className="size-4 text-destructive" />
																</Button>
															</DialogAction>
														</div>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
