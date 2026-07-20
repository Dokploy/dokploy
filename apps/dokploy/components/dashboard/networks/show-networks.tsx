"use client";

import { Loader2, Network, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { HandleNetwork } from "@/components/dashboard/networks/handle-network";
import { DialogAction } from "@/components/shared/dialog-action";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const UsedByCell = ({ networkId }: { networkId: string }) => {
	const { data, isLoading } = api.network.usage.useQuery(
		{ networkId },
		{ staleTime: 30_000 },
	);
	if (isLoading) return <span className="text-muted-foreground">…</span>;
	const count = data?.length ?? 0;
	if (count === 0) return <span className="text-muted-foreground">—</span>;
	const summary = (data ?? [])
		.slice(0, 8)
		.map((r) => `${r.type}: ${r.name}`)
		.join("\n");
	const more = count > 8 ? `\n…and ${count - 8} more` : "";
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="cursor-help underline decoration-dotted">
						{count}
					</span>
				</TooltipTrigger>
				<TooltipContent className="whitespace-pre">
					{summary}
					{more}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

export const ShowNetworks = () => {
	const { data: networks, isLoading, refetch } = api.network.all.useQuery();
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { mutateAsync: removeNetwork, isPending: isRemoving } =
		api.network.remove.useMutation();
	const serverNameById = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of servers ?? []) m.set(s.serverId, s.name);
		return m;
	}, [servers]);

	const handleDelete = async (networkId: string, name: string) => {
		try {
			await removeNetwork({ networkId });
			toast.success(`Network "${name}" removed`);
			await refetch();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove network",
			);
		}
	};

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<div className="flex flex-row justify-between items-center">
						<CardHeader>
							<CardTitle className="text-xl flex flex-row gap-2">
								<Network className="size-6 text-muted-foreground self-center" />
								Networks
							</CardTitle>
							<CardDescription>
								Manage Docker networks for your organization. Each network lives
								on a single Docker host — apps on different servers can't share
								one. Networks can be scoped to a server (optional).
							</CardDescription>
						</CardHeader>
						{networks && networks.length > 0 && <HandleNetwork />}
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
													<TableHead>Used by</TableHead>
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
															{n.serverId
																? (serverNameById.get(n.serverId) ?? n.serverId)
																: "Dokploy host"}
														</TableCell>
														<TableCell>
															<UsedByCell networkId={n.networkId} />
														</TableCell>
														<TableCell className="text-muted-foreground">
															{new Date(n.createdAt).toLocaleDateString()}
														</TableCell>
														<TableCell>
															<DialogAction
																title={`Delete "${n.name}"?`}
																description="The Docker network will be removed first. If it's in use by running containers the delete will fail."
																onClick={() =>
																	handleDelete(n.networkId, n.name)
																}
															>
																<Button
																	variant="ghost"
																	size="icon"
																	disabled={isRemoving}
																	aria-label="Delete network"
																>
																	<Trash2 className="size-4 text-destructive" />
																</Button>
															</DialogAction>
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
