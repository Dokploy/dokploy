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
	Eye,
	FolderOpen,
	HardDrive,
	Loader2,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FilesExplorerModal } from "@/components/dashboard/docker/files/files-explorer-modal";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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

type VolumeRow =
	inferRouterOutputs<AppRouter>["dockerVolume"]["getVolumes"][number];

interface Props {
	serverId?: string;
}

const SIZE_UNITS: Record<string, number> = {
	b: 1,
	kb: 1e3,
	mb: 1e6,
	gb: 1e9,
	tb: 1e12,
};

const parseSize = (size?: string) => {
	if (!size) return -1;
	const match = /^([\d.]+)\s*([a-zA-Z]+)$/.exec(size.trim());
	if (!match?.[1] || !match[2]) return -1;
	return Number(match[1]) * (SIZE_UNITS[match[2].toLowerCase()] ?? 1);
};

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

const ShowVolumeConfig = ({
	volumeName,
	serverId,
}: {
	volumeName: string;
	serverId?: string;
}) => {
	const [open, setOpen] = useState(false);
	const { data, isLoading, error } = api.dockerVolume.getVolumeConfig.useQuery(
		{ volumeName, serverId },
		{ enabled: open },
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon-sm" aria-label="View volume config">
					<Eye className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="w-full md:w-[70vw] min-w-[70vw]">
				<DialogHeader>
					<DialogTitle>Volume Config</DialogTitle>
					<DialogDescription>
						docker volume inspect output for "{volumeName}"
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<AlertBlock type="error">{error.message}</AlertBlock>
				) : isLoading ? (
					<div className="flex flex-row gap-2 items-center justify-center py-10 text-sm text-muted-foreground">
						<span>Loading...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				) : (
					<div className="text-wrap rounded-lg border p-4 overflow-y-auto text-sm bg-card max-h-[80vh]">
						<code>
							<pre className="whitespace-pre-wrap wrap-break-word">
								<CodeEditor
									language="json"
									lineWrapping
									lineNumbers={false}
									readOnly
									value={JSON.stringify(data, null, 2)}
								/>
							</pre>
						</code>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export const ShowVolumes = ({ serverId }: Props) => {
	const utils = api.useUtils();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "Name", desc: false },
	]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: volumes, isLoading } = api.dockerVolume.getVolumes.useQuery({
		serverId,
	});
	const { data: sizes, isLoading: isLoadingSizes } =
		api.dockerVolume.getVolumesSize.useQuery({ serverId });

	const sizeByName = useMemo(
		() => new Map((sizes ?? []).map((entry) => [entry.name, entry.size])),
		[sizes],
	);
	const { mutateAsync: removeVolume } =
		api.dockerVolume.removeVolume.useMutation();

	const filteredData = useMemo(() => {
		const list = volumes ?? [];
		if (!globalFilter.trim()) {
			return list;
		}
		const query = globalFilter.toLowerCase();
		return list.filter((volume) => volume.Name.toLowerCase().includes(query));
	}, [volumes, globalFilter]);

	const columns = useMemo<ColumnDef<VolumeRow>[]>(
		() => [
			{
				accessorKey: "Name",
				header: ({ column }) => <SortableHeader column={column} title="Name" />,
				cell: ({ row }) => (
					<div
						className="max-w-[280px] truncate font-medium"
						title={row.original.Name}
					>
						{row.original.Name}
					</div>
				),
			},
			{
				accessorKey: "Driver",
				header: ({ column }) => (
					<SortableHeader column={column} title="Driver" />
				),
				cell: ({ row }) => (
					<Badge variant="outline">{row.original.Driver}</Badge>
				),
			},
			{
				accessorKey: "Scope",
				header: ({ column }) => (
					<SortableHeader column={column} title="Scope" />
				),
				cell: ({ row }) => (
					<span className="text-muted-foreground">{row.original.Scope}</span>
				),
			},
			{
				id: "Size",
				header: ({ column }) => <SortableHeader column={column} title="Size" />,
				sortingFn: (a, b) =>
					parseSize(sizeByName.get(a.original.Name) ?? undefined) -
					parseSize(sizeByName.get(b.original.Name) ?? undefined),
				cell: ({ row }) =>
					isLoadingSizes ? (
						<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
					) : (
						<span className="text-muted-foreground">
							{sizeByName.get(row.original.Name) ?? "-"}
						</span>
					),
			},
			{
				accessorKey: "Mountpoint",
				header: ({ column }) => (
					<SortableHeader column={column} title="Mountpoint" />
				),
				cell: ({ row }) => (
					<div
						className="max-w-[320px] truncate font-mono text-xs text-muted-foreground"
						title={row.original.Mountpoint}
					>
						{row.original.Mountpoint}
					</div>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				header: () => <div className="text-right">Actions</div>,
				cell: ({ row }) => (
					<div className="flex items-center justify-end gap-3">
						<FilesExplorerModal
							volumeName={row.original.Name}
							serverId={serverId}
							asDropdownItem={false}
						>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Browse volume files"
							>
								<FolderOpen className="size-4" />
							</Button>
						</FilesExplorerModal>
						<ShowVolumeConfig
							volumeName={row.original.Name}
							serverId={serverId}
						/>
						<DialogAction
							title="Delete volume"
							description={`The volume "${row.original.Name}" will be removed from Docker. This action cannot be undone.`}
							onClick={async () => {
								try {
									await removeVolume({
										volumeName: row.original.Name,
										serverId,
									});
									toast.success("Volume deleted");
									await utils.dockerVolume.getVolumes.invalidate();
								} catch (error) {
									toast.error("Error deleting volume", {
										description:
											error instanceof Error ? error.message : "Unknown error",
									});
								}
							}}
						>
							<Button variant="ghost" size="icon-sm" aria-label="Delete volume">
								<Trash2 className="size-4 text-destructive" />
							</Button>
						</DialogAction>
					</div>
				),
			},
		],
		[serverId, removeVolume, utils, sizeByName, isLoadingSizes],
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
							<HardDrive className="size-6 text-muted-foreground self-center" />
							Volumes
						</CardTitle>
						<CardDescription>
							Manage the Docker volumes of the selected server.
						</CardDescription>
					</CardHeader>

					<CardContent className="space-y-4 py-8 border-t">
						{isLoading ? (
							<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[45vh]">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : !volumes?.length ? (
							<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
								<div className="rounded-full bg-muted p-4">
									<HardDrive className="size-10 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium">No volumes found</p>
									<p className="max-w-sm text-sm text-muted-foreground">
										Docker volumes created on this server will appear here.
									</p>
								</div>
							</div>
						) : (
							<>
								<div className="flex flex-wrap items-center gap-2">
									<Input
										placeholder="Search by name..."
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
														No volumes match your filters.
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
