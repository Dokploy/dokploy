import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import {
	type ColumnFiltersState,
	type PaginationState,
	type SortingState,
	type VisibilityState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import copy from "copy-to-clipboard";
import {
	CheckCircle2Icon,
	ChevronDown,
	Copy,
	Download,
	Globe,
	InfoIcon,
	Server,
	TrendingUpIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { columns, getStatusColor } from "./columns";
import type { LogEntry } from "./show-requests";
import { DataTableFacetedFilter } from "./status-request-filter";

export const priorities = [
	{
		label: "100 - 199",
		value: "info",
		icon: InfoIcon,
	},
	{
		label: "200 - 299",
		value: "success",
		icon: CheckCircle2Icon,
	},
	{
		label: "300 - 399",
		value: "redirect",
		icon: TrendingUpIcon,
	},
	{
		label: "400 - 499",
		value: "client",
		icon: Globe,
	},
	{
		label: "500 - 599",
		value: "server",
		icon: Server,
	},
];
export const RequestsTable = () => {
	const [statusFilter, setStatusFilter] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [selectedRow, setSelectedRow] = useState<LogEntry>();
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = useState({});
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	const { data: statsLogs, isLoading } = api.settings.readStatsLogs.useQuery(
		{
			sort: sorting[0],
			page: pagination,
			search,
			status: statusFilter,
		},
		{
			refetchInterval: 1333,
		},
	);

	const pageCount = useMemo(() => {
		if (statsLogs?.totalCount) {
			return Math.ceil(statsLogs.totalCount / pagination.pageSize);
		}
		return -1;
	}, [statsLogs?.totalCount, pagination.pageSize]);

	const table = useReactTable({
		data: statsLogs?.data ?? [],
		columns,
		onPaginationChange: setPagination,
		onSortingChange: setSorting,
		pageCount: pageCount,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		manualPagination: true,
		state: {
			pagination,
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	});

	const formatValue = (key: string, value: any) => {
		if (typeof value === "object" && value !== null) {
			return JSON.stringify(value, null, 2);
		}
		if (key === "Duration" || key === "OriginDuration" || key === "Overhead") {
			return `${value / 1000000000} s`;
		}
		if (key === "level") {
			return <Badge variant="secondary">{value}</Badge>;
		}
		if (key === "RequestMethod") {
			return <Badge variant="outline">{value}</Badge>;
		}
		if (key === "DownstreamStatus" || key === "OriginStatus") {
			return <Badge variant={getStatusColor(value)}>{value}</Badge>;
		}
		return value;
	};

	return (
		<>
			<div className="flex w-full flex-col gap-6 ">
				<div className="mt-6 grid w-full gap-4 pb-20">
					<div className="flex w-full flex-col gap-4 overflow-auto">
						<div className="flex items-center gap-2 max-sm:flex-wrap">
							<Input
								placeholder="Filter by name..."
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								className="md:max-w-sm"
							/>
							<DataTableFacetedFilter
								value={statusFilter}
								setValue={setStatusFilter}
								title="Status"
								options={priorities}
							/>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										className="max-sm:w-full sm:ml-auto"
									>
										Columns <ChevronDown className="ml-2 h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{table
										.getAllColumns()
										.filter((column) => column.getCanHide())
										.map((column) => {
											return (
												<DropdownMenuCheckboxItem
													key={column.id}
													className="capitalize"
													checked={column.getIsVisible()}
													onCheckedChange={(value) =>
														column.toggleVisibility(!!value)
													}
												>
													{column.id}
												</DropdownMenuCheckboxItem>
											);
										})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<div className="rounded-md border ">
							<Table>
								<TableHeader>
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext(),
																)}
													</TableHead>
												);
											})}
										</TableRow>
									))}
								</TableHeader>
								<TableBody>
									{table.getRowModel().rows?.length ? (
										table.getRowModel().rows.map((row) => (
											<TableRow
												key={row.id}
												className="cursor-pointer"
												onClick={() => {
													setSelectedRow(row.original);
												}}
												data-state={row.getIsSelected() && "selected"}
											>
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
												className="h-24 text-center"
											>
												{statsLogs?.data.length === 0 && (
													<div className="flex h-[55vh] w-full flex-col items-center justify-center gap-2">
														<span className="font-medium text-lg text-muted-foreground">
															No results.
														</span>
													</div>
												)}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className="flex items-center justify-end space-x-2 py-4">
							{statsLogs?.totalCount && (
								<span className="text-muted-foreground text-sm">
									Showing{" "}
									{Math.min(
										pagination.pageIndex * pagination.pageSize + 1,
										statsLogs.totalCount,
									)}{" "}
									to{" "}
									{Math.min(
										(pagination.pageIndex + 1) * pagination.pageSize,
										statsLogs.totalCount,
									)}{" "}
									of {statsLogs.totalCount} entries
								</span>
							)}
							<div className="flex flex-wrap space-x-2">
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
				</div>
			</div>
			<Sheet
				open={!!selectedRow}
				onOpenChange={(open) => setSelectedRow(undefined)}
			>
				<SheetContent className="flex flex-col sm:max-w-[740px]">
					<SheetHeader>
						<SheetTitle>Request log</SheetTitle>
						<SheetDescription>
							Details of the request log entry.
						</SheetDescription>
					</SheetHeader>
					<ScrollArea className="mt-4 flex-grow pr-4">
						<div className="rounded-md border">
							<Table>
								<TableBody>
									{Object.entries(selectedRow || {}).map(([key, value]) => (
										<TableRow key={key}>
											<TableCell className="font-medium">{key}</TableCell>
											<TableCell className="break-before-all truncate whitespace-pre-wrap break-words">
												{key === "RequestAddr" ? (
													<div className="flex items-center gap-2 rounded bg-muted p-1">
														<span>{value}</span>
														<Copy
															onClick={() => {
																copy(value);
																toast.success("Copied to clipboard");
															}}
															className="h-4 w-4 cursor-pointer text-muted-foreground"
														/>
													</div>
												) : (
													formatValue(key, value)
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</ScrollArea>
					<div className="mt-4 border-t pt-4">
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={() => {
								const logs = JSON.stringify(selectedRow, null, 2);
								const element = document.createElement("a");
								element.setAttribute(
									"href",
									`data:text/plain;charset=utf-8,${encodeURIComponent(logs)}`,
								);
								element.setAttribute("download", "logs.json");

								element.style.display = "none";
								document.body.appendChild(element);

								element.click();

								document.body.removeChild(element);
							}}
						>
							<Download className="h-4 w-4" />
							Download as JSON
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
};
