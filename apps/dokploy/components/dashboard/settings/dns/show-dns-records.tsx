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
import {
	ArrowLeft,
	ArrowUpDown,
	Cloud,
	CloudOff,
	ListTree,
	Loader2,
	PenBoxIcon,
	PlusIcon,
	Search,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { FocusShortcutInput } from "@/components/shared/focus-shortcut-input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import {
	DNS_RECORD_TYPES,
	DnsRecordPanel,
	type DnsRecordValue,
	PROXIABLE_TYPES,
} from "./dns-record-panel";
import { DnsRecordTypeBadge } from "./dns-record-type-badge";

interface Props {
	dnsProviderId: string;
	zoneId: string;
}

const PAGE_SIZES = [10, 20, 50, 100];

const SortableHeader = ({
	column,
	title,
	className,
}: {
	column: {
		getIsSorted: () => false | "asc" | "desc";
		toggleSorting: (asc: boolean) => void;
	};
	title: string;
	className?: string;
}) => (
	<Button
		variant="ghost"
		size="xs"
		className={cn("-ml-2.5 text-muted-foreground", className)}
		onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	>
		{title}
		<ArrowUpDown className="size-3" />
	</Button>
);

export const ShowDnsRecords = ({ dnsProviderId, zoneId }: Props) => {
	const utils = api.useUtils();
	const [isPanelOpen, setIsPanelOpen] = useState(false);
	const [editing, setEditing] = useState<DnsRecordValue | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "name", desc: false },
	]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: provider } = api.dnsProvider.one.useQuery({ dnsProviderId });
	const { data: zones } = api.dnsProvider.listZones.useQuery({ dnsProviderId });
	const { data, isPending, isError, error } =
		api.dnsProvider.listRecords.useQuery({ dnsProviderId, zoneId });
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { mutateAsync: deleteRecord } =
		api.dnsProvider.deleteRecord.useMutation();

	const zoneName = zones?.find((zone) => zone.id === zoneId)?.name ?? "";
	const isCloudflare = provider?.providerType === "cloudflare";
	const canWrite = !!permissions?.dnsProvider.update;
	const canDelete = !!permissions?.dnsProvider.delete;

	const openEdit = (record: DnsRecordValue) => {
		setEditing(record);
		setIsPanelOpen(true);
	};

	const availableTypes = useMemo(
		() => [...new Set((data ?? []).map((record) => record.type))].sort(),
		[data],
	);

	const filteredRecords = useMemo(() => {
		const query = search.trim().toLowerCase();
		return (data ?? []).filter((record) => {
			if (typeFilter !== "all" && record.type !== typeFilter) return false;
			if (!query) return true;
			return (
				record.name.toLowerCase().includes(query) ||
				record.content.toLowerCase().includes(query) ||
				record.type.toLowerCase().includes(query)
			);
		});
	}, [data, search, typeFilter]);

	const handleDelete = async (record: DnsRecordValue) => {
		setDeletingId(record.id);
		await deleteRecord({ dnsProviderId, zoneId, recordId: record.id })
			.then(() => {
				toast.success("Record deleted");
				utils.dnsProvider.listRecords.invalidate({ dnsProviderId, zoneId });
				if (editing?.id === record.id) setIsPanelOpen(false);
			})
			.catch(() => {
				toast.error("Error deleting the record");
			})
			.finally(() => setDeletingId(null));
	};

	const columns = useMemo<ColumnDef<DnsRecordValue>[]>(
		() => [
			{
				accessorKey: "type",
				header: ({ column }) => <SortableHeader column={column} title="Type" />,
				cell: ({ row }) => <DnsRecordTypeBadge type={row.original.type} />,
			},
			{
				accessorKey: "name",
				header: ({ column }) => <SortableHeader column={column} title="Name" />,
				cell: ({ row }) => (
					<span
						className="block max-w-[22ch] truncate font-medium"
						title={row.original.name}
					>
						{row.original.name}
					</span>
				),
			},
			{
				accessorKey: "content",
				header: ({ column }) => (
					<SortableHeader column={column} title="Value" />
				),
				cell: ({ row }) => (
					<span
						className="block max-w-[32ch] truncate font-mono text-xs text-muted-foreground"
						title={row.original.content}
					>
						{row.original.content}
					</span>
				),
			},
			{
				accessorKey: "ttl",
				header: ({ column }) => <SortableHeader column={column} title="TTL" />,
				cell: ({ row }) => (
					<span className="text-xs text-muted-foreground tabular-nums">
						{row.original.ttl === 1 ? "Auto" : row.original.ttl}
					</span>
				),
			},
			...(isCloudflare
				? [
						{
							accessorKey: "proxied",
							header: ({ column }) => (
								<SortableHeader column={column} title="Proxy" />
							),
							cell: ({ row }) => {
								if (!PROXIABLE_TYPES.includes(row.original.type)) {
									return null;
								}
								const proxied = !!row.original.proxied;
								return (
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="inline-flex">
												{proxied ? (
													<Cloud className="size-4 text-[#f6821f]" />
												) : (
													<CloudOff className="size-4 text-muted-foreground" />
												)}
												<span className="sr-only">
													{proxied ? "Proxied" : "DNS only"}
												</span>
											</span>
										</TooltipTrigger>
										<TooltipContent>
											{proxied ? "Proxied" : "DNS only"}
										</TooltipContent>
									</Tooltip>
								);
							},
						} satisfies ColumnDef<DnsRecordValue>,
					]
				: []),
			{
				id: "actions",
				enableSorting: false,
				header: () => <span className="sr-only">Actions</span>,
				cell: ({ row }) => {
					const record = row.original;
					const isEditable = (DNS_RECORD_TYPES as readonly string[]).includes(
						record.type,
					);
					return (
						<div className="flex items-center justify-end gap-1">
							{canWrite && isEditable && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											className="text-muted-foreground"
											onClick={() => openEdit(record)}
										>
											<PenBoxIcon className="size-4" />
											<span className="sr-only">Edit record</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>Edit record</TooltipContent>
								</Tooltip>
							)}
							{canDelete && (
								<Tooltip>
									<DialogAction
										title="Delete Record"
										description={`Delete the ${record.type} record "${record.name}"? This removes it from the DNS provider, not just from Dokploy.`}
										type="destructive"
										onClick={() => handleDelete(record)}
									>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon-sm"
												className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
												isLoading={deletingId === record.id}
											>
												<Trash2 className="size-4" />
												<span className="sr-only">Delete record</span>
											</Button>
										</TooltipTrigger>
									</DialogAction>
									<TooltipContent>Delete record</TooltipContent>
								</Tooltip>
							)}
						</div>
					);
				},
			},
		],
		[canWrite, canDelete, deletingId, editing?.id, isCloudflare],
	);

	const pageCount = Math.max(
		1,
		Math.ceil(filteredRecords.length / pagination.pageSize),
	);
	const pageIndex = Math.min(pagination.pageIndex, pageCount - 1);

	const resetToFirstPage = () =>
		setPagination((previous) => ({ ...previous, pageIndex: 0 }));

	const table = useReactTable({
		data: filteredRecords,
		columns,
		getRowId: (row) => row.id,
		state: {
			sorting,
			pagination: { pageIndex, pageSize: pagination.pageSize },
		},
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div className="w-full ">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<div className="flex flex-wrap items-center justify-between gap-4 p-6">
						<div className="flex flex-1 flex-row items-center gap-3">
							<Button variant="ghost" size="icon" asChild>
								<Link href={`/dashboard/settings/dns/${dnsProviderId}`}>
									<ArrowLeft className="size-4" />
									<span className="sr-only">Back to domains</span>
								</Link>
							</Button>
							<CardHeader className="flex-1 p-0">
								<CardTitle className="text-xl">
									{zoneName || "DNS records"}
								</CardTitle>
								<CardDescription>
									Records managed through {provider?.name ?? "this provider"}.
									Changes are written straight to the provider.
								</CardDescription>
							</CardHeader>
						</div>
						{canWrite && (
							<Button
								onClick={() => {
									setEditing(null);
									setIsPanelOpen(true);
								}}
							>
								<PlusIcon className="size-4" />
								Add Record
							</Button>
						)}
					</div>

					<CardContent className="min-h-[60vh] border-t py-8">
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						<div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
							<div className="flex min-w-0 flex-1 flex-col gap-4">
								{isPending ? (
									<div className="flex min-h-[45vh] flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
										<span>Loading...</span>
										<Loader2 className="animate-spin size-4" />
									</div>
								) : data?.length === 0 ? (
									<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
										<div className="rounded-full bg-muted p-4">
											<ListTree className="size-10 text-muted-foreground" />
										</div>
										<div className="space-y-1 text-center">
											<p className="text-sm font-medium">
												No records in this zone
											</p>
											<p className="max-w-sm text-sm text-muted-foreground">
												Add an A or CNAME record to point this domain at one of
												your servers.
											</p>
										</div>
									</div>
								) : (
									<>
										<div className="flex flex-wrap items-center gap-2">
											<div className="relative min-w-52 flex-1">
												<FocusShortcutInput
													placeholder="Filter records..."
													value={search}
													onChange={(e) => {
														setSearch(e.target.value);
														resetToFirstPage();
													}}
													className="pr-10"
												/>
												<Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
											</div>
											<Select
												value={typeFilter}
												onValueChange={(value) => {
													setTypeFilter(value);
													resetToFirstPage();
												}}
											>
												<SelectTrigger className="w-36">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All types</SelectItem>
													{availableTypes.map((type) => (
														<SelectItem key={type} value={type}>
															{type}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<span className="ml-auto text-xs text-muted-foreground tabular-nums">
												{filteredRecords.length} of {data?.length ?? 0}
											</span>
										</div>

										<div className="overflow-hidden rounded-lg border">
											<Table>
												<TableHeader className="[&_tr]:border-b">
													{table.getHeaderGroups().map((headerGroup) => (
														<TableRow
															key={headerGroup.id}
															className="bg-muted/40 hover:bg-muted/40"
														>
															{headerGroup.headers.map((header) => (
																<TableHead
																	key={header.id}
																	className={cn(
																		"h-9 px-4 text-xs",
																		header.id === "actions" && "text-right",
																	)}
																>
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
													{table.getRowModel().rows.length ? (
														table.getRowModel().rows.map((row) => {
															const isEditable = (
																DNS_RECORD_TYPES as readonly string[]
															).includes(row.original.type);
															const isSelected =
																isPanelOpen && editing?.id === row.original.id;
															return (
																<TableRow
																	key={row.id}
																	data-state={
																		isSelected ? "selected" : undefined
																	}
																	onClick={
																		canWrite && isEditable
																			? () => openEdit(row.original)
																			: undefined
																	}
																	className={cn(
																		"duration-150 ease-out",
																		canWrite && isEditable && "cursor-pointer",
																	)}
																>
																	{row.getVisibleCells().map((cell) => (
																		<TableCell
																			key={cell.id}
																			onClick={
																				cell.column.id === "actions"
																					? (event) => event.stopPropagation()
																					: undefined
																			}
																			className="px-4 py-2"
																		>
																			{flexRender(
																				cell.column.columnDef.cell,
																				cell.getContext(),
																			)}
																		</TableCell>
																	))}
																</TableRow>
															);
														})
													) : (
														<TableRow className="hover:bg-transparent">
															<TableCell
																colSpan={columns.length}
																className="h-24 text-center text-muted-foreground"
															>
																No records match your filters.
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</div>

										<div className="flex flex-wrap items-center justify-between gap-4">
											<div className="flex items-center gap-2">
												<span className="text-sm text-muted-foreground">
													Rows per page
												</span>
												<Select
													value={String(pagination.pageSize)}
													onValueChange={(value) =>
														setPagination({
															pageIndex: 0,
															pageSize: Number(value),
														})
													}
												>
													<SelectTrigger size="sm" className="w-20">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{PAGE_SIZES.map((size) => (
															<SelectItem key={size} value={String(size)}>
																{size}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<div className="flex items-center gap-4">
												<span className="text-sm text-muted-foreground tabular-nums">
													Page {pageIndex + 1} of {pageCount}
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
										</div>
									</>
								)}
							</div>

							<div
								className={cn(
									"t-panel-track grid lg:shrink-0 lg:grid-rows-[1fr]",
									isPanelOpen
										? "grid-rows-[1fr] lg:grid-cols-[1fr]"
										: "grid-rows-[0fr] lg:grid-cols-[0fr]",
								)}
							>
								<div className="overflow-hidden">
									<div
										data-open={isPanelOpen}
										className="t-panel-slide-x w-full lg:w-[380px]"
									>
										{canWrite && (
											<DnsRecordPanel
												key={editing?.id ?? "new"}
												dnsProviderId={dnsProviderId}
												zoneId={zoneId}
												zoneName={zoneName}
												record={editing}
												onClose={() => setIsPanelOpen(false)}
											/>
										)}
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
