"use client";

import { Loader2, Network } from "lucide-react";
import { HandleNetwork } from "@/components/dashboard/networks/handle-network";
import { Button } from "@/components/ui/button";
import {
	Card,
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

export const ShowNetworks = () => {
	const { data: networks, isLoading } = api.network.all.useQuery();

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<div className="flex flex-row justify-between items-center">
						<CardHeader className="">
							<CardTitle className="text-xl flex flex-row gap-2">
								<Network className="size-6 text-muted-foreground self-center" />
								Networks
							</CardTitle>
							<CardDescription>
								Manage Docker networks for your organization. Networks can be
								scoped to a server (optional).
							</CardDescription>
						</CardHeader>
						{networks && networks?.length > 0 && <HandleNetwork />}
					</div>

					<CardContent className="space-y-2 py-8 border-t">
						<div className="gap-4 pb-20 w-full">
							<div className="flex flex-col gap-4 w-full overflow-auto">
								<div className="rounded-md border">
									{isLoading ? (
										<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground h-[55vh]">
											<span>Loading...</span>
											<Loader2 className="animate-spin size-4" />
										</div>
									) : !networks?.length ? (
										<div className="flex min-h-[55vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
											<div className="rounded-full bg-muted p-4">
												<Network className="size-10 text-muted-foreground" />
											</div>
											<div className="space-y-1 text-center">
												<p className="text-sm font-medium">No networks yet</p>
												<p className="max-w-sm text-sm text-muted-foreground">
													Create Docker networks for your organization and
													optionally attach them to a server. Add your first
													network to get started.
												</p>
											</div>
											<HandleNetwork />
										</div>
									) : (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Name</TableHead>
													<TableHead>Driver</TableHead>
													<TableHead>Scope</TableHead>
													<TableHead>Internal</TableHead>
													<TableHead>Attachable</TableHead>
													<TableHead>Server</TableHead>
													<TableHead>Created</TableHead>
													<TableHead className="w-[80px]">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{networks.map((n) => (
													<TableRow key={n.networkId}>
														<TableCell className="font-medium">
															{n.name}
														</TableCell>
														<TableCell>{n.driver}</TableCell>
														<TableCell>{n.scope ?? "—"}</TableCell>
														<TableCell>{n.internal ? "Yes" : "No"}</TableCell>
														<TableCell>{n.attachable ? "Yes" : "No"}</TableCell>
														<TableCell>
															{n.serverId ?? "Dokploy server"}
														</TableCell>
														<TableCell className="text-muted-foreground">
															{new Date(n.createdAt).toLocaleDateString()}
														</TableCell>
														<TableCell>
															<HandleNetwork networkId={n.networkId}>
																<Button variant="ghost" size="sm">
																	Edit
																</Button>
															</HandleNetwork>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									)}
								</div>
							</div>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
