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
	Boxes,
	Database,
	Gauge,
	HardDrive,
	Layers,
	Loader2,
	type LucideIcon,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
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

type DiskUsageItem =
	inferRouterOutputs<AppRouter>["dockerDiskUsage"]["getDiskUsage"][number];
type BuildCacheBase =
	inferRouterOutputs<AppRouter>["dockerDiskUsage"]["getBuildCache"][number];
type BuildCacheRow = BuildCacheBase & { key: string };

interface Props {
	serverId?: string;
}

const STAT_CARDS: { type: string; title: string; icon: LucideIcon }[] = [
	{ type: "Images", title: "Images", icon: Layers },
	{ type: "Containers", title: "Containers", icon: Boxes },
	{ type: "Local Volumes", title: "Volumes", icon: HardDrive },
	{ type: "Build Cache", title: "Build Cache", icon: Database },
];

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

const StatCard = ({
	icon: Icon,
	title,
	item,
	isLoading,
}: {
	icon: LucideIcon;
	title: string;
	item?: DiskUsageItem;
	isLoading: boolean;
}) => (
	<Card className="p-4">
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<Icon className="size-4" />
			{title}
		</div>
		{isLoading ? (
			<div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
			</div>
		) : (
			<>
				<div className="mt-2 text-2xl font-semibold">{item?.size ?? "-"}</div>
				<div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
					<span>{item?.totalCount ?? 0} total</span>
					<span>{item?.active ?? 0} active</span>
					<span>{item?.reclaimable ?? "-"} reclaimable</span>
				</div>
			</>
		)}
	</Card>
);

export const ShowDiskUsage = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "Size", desc: true },
	]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: diskUsage, isLoading: isLoadingDiskUsage } =
		api.dockerDiskUsage.getDiskUsage.useQuery({ serverId });
	const { data: buildCache, isLoading: isLoadingBuildCache } =
		api.dockerDiskUsage.getBuildCache.useQuery({ serverId });
	const { mutateAsync: pruneBuildCache, isPending: isPruning } =
		api.dockerDiskUsage.pruneBuildCache.useMutation();

	const usageByType = useMemo(
		() => new Map((diskUsage ?? []).map((item) => [item.type, item])),
		[diskUsage],
	);

	const rows = useMemo<BuildCacheRow[]>(
		() =>
			(buildCache ?? []).map((entry) => ({
				...entry,
				key: entry.id,
			})),
		[buildCache],
	);

	const filteredData = useMemo(() => {
		if (!globalFilter.trim()) {
			return rows;
		}
		const query = globalFilter.toLowerCase();
		return rows.filter(
			(entry) =>
				entry.id.toLowerCase().includes(query) ||
				entry.description.toLowerCase().includes(query) ||
				entry.type.toLowerCase().includes(query),
		);
	}, [rows, globalFilter]);

	const handlePrune = async () => {
		try {
			await pruneBuildCache({ serverId });
			toast.success("Build cache pruned");
			await Promise.all([
				utils.dockerDiskUsage.getBuildCache.invalidate(),
				utils.dockerDiskUsage.getDiskUsage.invalidate(),
			]);
		} catch (error) {
			toast.error("Error pruning build cache", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const columns = useMemo<ColumnDef<BuildCacheRow>[]>(
		() => [
			{
				accessorKey: "id",
				header: ({ column }) => (
					<SortableHeader column={column} title="Cache ID" />
				),
				cell: ({ row }) => (
					<span className="font-mono text-xs text-muted-foreground">
						{row.original.id.slice(0, 16)}
					</span>
				),
			},
			{
				accessorKey: "type",
				header: ({ column }) => <SortableHeader column={column} title="Type" />,
				cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
			},
			{
				accessorKey: "description",
				header: "Description",
				enableSorting: false,
				cell: ({ row }) => (
					<div
						className="max-w-[360px] truncate text-xs text-muted-foreground"
						title={row.original.description}
					>
						{row.original.description || "-"}
					</div>
				),
			},
			{
				id: "Size",
				accessorFn: (entry) => entry.sizeBytes,
				header: ({ column }) => <SortableHeader column={column} title="Size" />,
				cell: ({ row }) => (
					<span className="text-muted-foreground">{row.original.size}</span>
				),
			},
			{
				id: "created",
				accessorKey: "createdSince",
				header: "Created",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground whitespace-nowrap">
						{row.original.createdSince}
					</span>
				),
			},
			{
				id: "lastUsed",
				accessorKey: "lastUsedSince",
				header: "Last Used",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground whitespace-nowrap">
						{row.original.lastUsedSince}
					</span>
				),
			},
			{
				accessorKey: "usageCount",
				header: ({ column }) => (
					<SortableHeader column={column} title="Usage" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.usageCount}
					</span>
				),
			},
			{
				id: "flags",
				enableSorting: false,
				header: "Flags",
				cell: ({ row }) => (
					<div className="flex gap-1">
						{row.original.inUse && <Badge variant="blue">In use</Badge>}
						{row.original.shared && <Badge variant="outline">Shared</Badge>}
					</div>
				),
			},
		],
		[],
	);

	const table = useReactTable({
		data: filteredData,
		columns,
		getRowId: (row) => row.key,
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
		<div className="w-full space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{STAT_CARDS.map((stat) => (
					<StatCard
						key={stat.type}
						icon={stat.icon}
						title={stat.title}
						item={usageByType.get(stat.type)}
						isLoading={isLoadingDiskUsage}
					/>
				))}
			</div>
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle className="text-xl flex flex-row gap-2">
									<Gauge className="size-6 text-muted-foreground self-center" />
									Build Cache
								</CardTitle>
								<CardDescription>
									Cache layers kept by the Docker builder on the selected
									server.
								</CardDescription>
							</div>
							<DialogAction
								title="Prune build cache"
								description="This will remove all build cache entries that are not currently in use. This action cannot be undone."
								onClick={handlePrune}
								disabled={isPruning}
							>
								<Button variant="outline" size="sm" disabled={isPruning}>
									<Trash2 className="size-4 mr-1" />
									Prune build cache
								</Button>
							</DialogAction>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-8 border-t">
						{isLoadingBuildCache ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[45vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !buildCache?.length ? (
							<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
								<div className="rounded-full bg-muted p-4">
									<Database className="size-10 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium">No build cache found</p>
									<p className="max-w-sm text-sm text-muted-foreground">
										Layers cached by "docker build" on this server will appear
										here.
									</p>
								</div>
							</div>
						) : (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Input
										placeholder="Search by id, type or description..."
										value={globalFilter}
										onChange={(e) => setGlobalFilter(e.target.value)}
										className="max-w-xs"
									/>
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
														No build cache entries match your filters.
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
