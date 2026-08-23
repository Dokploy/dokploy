"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import {
	ArrowUpDown,
	Loader2,
	Network,
	RotateCcw,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type NetworkRow = inferRouterOutputs<AppRouter>["network"]["all"][number];

interface Props {
	/** Selected server; undefined shows the local Dokploy server */
	serverId?: string;
}

const getIpamEntries = (row: NetworkRow) =>
	(row.ipam?.config ?? []).filter((c) => c.subnet || c.gateway || c.ipRange);

const SortableHeader = ({
	column,
	title,
}: {
	column: {
		getIsSorted: () => false | "asc" | "desc";
		toggleSorting: (asc: boolean) => void;
	};
	title: string;
}) => (
	<Button
		variant="ghost"
		className="-ml-3 h-8"
		onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	>
		{title}
		<ArrowUpDown className="ml-2 size-4" />
	</Button>
);

export const ShowNetworks = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const [verified, setVerified] = useState(false);
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [driverFilter, setDriverFilter] = useState<string>("all");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: networks, isLoading } = api.network.all.useQuery({ serverId });
	const { mutateAsync: removeNetwork } = api.network.remove.useMutation();
	const recreateMutation = api.network.recreate.useMutation();

	// Same query the Sync dialog uses; "missing" tells us which records
	// no longer have a real network in Docker
	const {
		data: syncStatus,
		isFetching: isVerifying,
		refetch: refetchVerify,
	} = api.network.networksToSync.useQuery({ serverId }, { enabled: verified });

	const missingIds = useMemo(
		() => new Set(syncStatus?.missing.map((m) => m.networkId) ?? []),
		[syncStatus],
	);

	const onVerify = async () => {
		setVerified(true);
		const { data: result, error } = await refetchVerify();
		if (error) {
			toast.error("Error verifying networks", {
				description: error.message,
			});
			return;
		}
		if (!result) return;
		if (result.missing.length === 0) {
			toast.success("All networks exist in Docker");
		} else {
			toast.warning(
				`${result.missing.length} network(s) no longer exist in Docker`,
			);
		}
	};

	const filteredData = useMemo(() => {
		let list = networks ?? [];
		if (driverFilter !== "all") {
			list = list.filter((n) => n.driver === driverFilter);
		}
		if (globalFilter.trim()) {
			const query = globalFilter.toLowerCase();
			list = list.filter(
				(n) =>
					n.name.toLowerCase().includes(query) ||
					(n.ipam?.config ?? []).some(
						(c) =>
							c.subnet?.toLowerCase().includes(query) ||
							c.gateway?.toLowerCase().includes(query) ||
							c.ipRange?.toLowerCase().includes(query),
					),
			);
		}
		return list;
	}, [networks, driverFilter, globalFilter]);

	const columns = useMemo<ColumnDef<NetworkRow>[]>(
		() => [
			{
				accessorKey: "name",
				header: ({ column }) => <SortableHeader column={column} title="Name" />,
				cell: ({ row }) => (
					<div className="flex items-center gap-2 font-medium">
						{row.original.name}
						{verified &&
							syncStatus &&
							(missingIds.has(row.original.networkId) ? (
								<>
									<Badge variant="red">Missing in Docker</Badge>
									<Button
										variant="outline"
										size="xs"
										isLoading={recreateMutation.isPending}
										onClick={async () => {
											try {
												await recreateMutation.mutateAsync({
													networkId: row.original.networkId,
												});
												toast.success(
													`Network "${row.original.name}" recreated in Docker`,
												);
												await utils.network.networksToSync.invalidate();
											} catch (error) {
												toast.error("Error recreating network", {
													description:
														error instanceof Error
															? error.message
															: "Unknown error",
												});
											}
										}}
									>
										<RotateCcw className="size-3.5" />
										Recreate
									</Button>
								</>
							) : (
								<Badge variant="green">In sync</Badge>
							))}
					</div>
				),
			},
			{
				accessorKey: "driver",
				header: ({ column }) => (
					<SortableHeader column={column} title="Driver" />
				),
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<Badge variant="outline">{row.original.driver}</Badge>
						<span className="text-xs text-muted-foreground">
							{row.original.driver === "overlay" ? "swarm" : "local"}
						</span>
					</div>
				),
			},
			{
				id: "subnet",
				accessorFn: (row) => getIpamEntries(row)[0]?.subnet ?? "",
				header: ({ column }) => (
					<SortableHeader column={column} title="Subnet" />
				),
				cell: ({ row }) => {
					const ipamEntries = getIpamEntries(row.original);
					if (ipamEntries.length === 0) {
						return <span className="text-muted-foreground">Auto</span>;
					}
					return (
						<div className="flex flex-col gap-1">
							{ipamEntries.map((c, index) => (
								<div
									key={`${row.original.networkId}-ipam-${index}`}
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
					);
				},
			},
			{
				accessorKey: "internal",
				header: ({ column }) => (
					<SortableHeader column={column} title="Internal" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.internal ? "Yes" : "No"}
					</span>
				),
			},
			{
				accessorKey: "attachable",
				header: ({ column }) => (
					<SortableHeader column={column} title="Attachable" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.attachable ? "Yes" : "No"}
					</span>
				),
			},
			{
				accessorKey: "createdAt",
				header: ({ column }) => (
					<SortableHeader column={column} title="Created" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground whitespace-nowrap">
						{new Date(row.original.createdAt).toLocaleDateString()}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				header: () => <div className="text-right">Actions</div>,
				cell: ({ row }) => (
					<div className="flex items-center justify-end gap-3">
						<ShowNetworkConfig
							networkId={row.original.networkId}
							networkName={row.original.name}
						/>
						<DialogAction
							title="Delete network"
							description={`The network "${row.original.name}" will be removed from Docker and Dokploy. This action cannot be undone.`}
							onClick={async () => {
								try {
									await removeNetwork({
										networkId: row.original.networkId,
									});
									toast.success("Network deleted");
									await utils.network.all.invalidate();
									await utils.network.networksToSync.invalidate();
								} catch (error) {
									toast.error("Error deleting network", {
										description:
											error instanceof Error ? error.message : "Unknown error",
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
				),
			},
		],
		[verified, syncStatus, missingIds, removeNetwork, recreateMutation, utils],
	);

	const table = useReactTable({
		data: filteredData,
		columns,
		state: {
			sorting,
			pagination,
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

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
								{networks && networks.length > 0 && (
									<Button
										variant="outline"
										isLoading={isVerifying}
										onClick={onVerify}
									>
										<ShieldCheck className="size-4" />
										Verify
									</Button>
								)}
								<SyncNetworks serverId={serverId} />
								{networks && networks.length > 0 && (
									<HandleNetwork serverId={serverId} />
								)}
							</div>
						</CardAction>
					</CardHeader>

					<CardContent className="space-y-4 py-8 border-t">
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
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Input
										placeholder="Search by name, subnet, gateway..."
										value={globalFilter}
										onChange={(e) => setGlobalFilter(e.target.value)}
										className="max-w-xs"
									/>
									<Select value={driverFilter} onValueChange={setDriverFilter}>
										<SelectTrigger className="w-[150px]">
											<SelectValue placeholder="Driver" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All drivers</SelectItem>
											<SelectItem value="bridge">bridge</SelectItem>
											<SelectItem value="overlay">overlay</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="rounded-md border overflow-x-auto">
									<Table>
										<TableHeader>
											{table.getHeaderGroups().map((headerGroup) => (
												<TableRow key={headerGroup.id}>
													{headerGroup.headers.map((header) => (
														<TableHead key={header.id}>
															{header.isPlaceholder
																? null
																: flexRender(
																		header.column.columnDef.header,
																		header.getContext(),
																	)}
														</TableHead>
													))}
												</TableRow>
											))}
										</TableHeader>
										<TableBody>
											{table.getRowModel().rows?.length ? (
												table.getRowModel().rows.map((row) => (
													<TableRow key={row.id}>
														{row.getVisibleCells().map((cell) => (
															<TableCell key={cell.id}>
																{flexRender(
																	cell.column.columnDef.cell,
																	cell.getContext(),
																)}
															</TableCell>
														))}
													</TableRow>
												))
											) : (
												<TableRow>
													<TableCell
														colSpan={columns.length}
														className="h-24 text-center text-muted-foreground"
													>
														No networks match your filters.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
								{table.getPageCount() > 1 && (
									<div className="flex items-center justify-end gap-4">
										<span className="text-sm text-muted-foreground">
											Page {table.getState().pagination.pageIndex + 1} of{" "}
											{table.getPageCount()}
										</span>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.previousPage()}
												disabled={!table.getCanPreviousPage()}
											>
												Previous
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => table.nextPage()}
												disabled={!table.getCanNextPage()}
											>
												Next
											</Button>
										</div>
									</div>
								)}
							</>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
