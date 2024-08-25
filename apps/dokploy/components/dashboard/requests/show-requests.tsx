import { api, type RouterOutputs } from "@/utils/api";
import {
	type ColumnFiltersState,
	type SortingState,
	type VisibilityState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import * as React from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ChevronDown,
	Copy,
	Download,
	MoreHorizontal,
	TrendingUp,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { columns } from "./columns";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type LogEntry = NonNullable<
	RouterOutputs["settings"]["readMonitoringConfig"]["data"]
>[0];

const chartConfig = {
	views: {
		label: "Page Views",
	},
	count: {
		label: "Count",
		color: "hsl(var(--chart-1))",
	},
} satisfies ChartConfig;

const requestLog = {
	id: "zagp0jxukx0mw7h",
	level: "ERROR (8)",
	created: "2024-08-25 05:33:45.366 UTC",
	"data.execTime": "0.056928ms",
	"data.type": "request",
	"data.auth": "guest",
	"data.status": "404",
	"data.method": "GET",
	"data.url": "/favicon.ico",
	"data.referer": "http://testing2-pocketbase-8d9cd5-5-161-87-31.traefik.me/",
	"data.remoteIp": "10.0.1.184",
	"data.userIp": "179.49.119.201",
	"data.userAgent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
	"data.error": "Not Found.",
	"data.details": "code=404, message=Not Found",
};
export const ShowRequests = () => {
	const { data, isLoading } = api.settings.readMonitoringConfig.useQuery(
		undefined,
		{
			refetchInterval: 1000,
		},
	);
	const [selectedRow, setSelectedRow] = useState<LogEntry>();
	const { data: isLogRotateActive, refetch: refetchLogRotate } =
		api.settings.getLogRotateStatus.useQuery();

	const { mutateAsync } = api.settings.activateLogRotate.useMutation();
	const { mutateAsync: deactivateLogRotate } =
		api.settings.deactivateLogRotate.useMutation();

	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[],
	);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});

	const table = useReactTable({
		data: data?.data ?? [],
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	});
	return (
		<>
			<Card className="bg-transparent mt-10">
				<CardHeader>
					<CardTitle>Request Distribution</CardTitle>
					<div className="flex justify-between gap-2">
						<CardDescription>
							<span>Showing web and API requests over time</span>
						</CardDescription>
						{!isLogRotateActive && (
							<Button
								onClick={() => {
									mutateAsync()
										.then(() => {
											toast.success("Log rotate activated");
											refetchLogRotate();
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								Activate Log Rotate
							</Button>
						)}

						{isLogRotateActive && (
							<Button
								onClick={() => {
									deactivateLogRotate()
										.then(() => {
											toast.success("Log rotate deactivated");
											refetchLogRotate();
										})
										.catch((err) => {
											toast.error(err.message);
										});
								}}
							>
								Deactivate Log Rotate
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer width="100%" height={200}>
						<ChartContainer config={chartConfig}>
							<AreaChart
								accessibilityLayer
								data={data?.hourlyData || []}
								margin={{
									left: 12,
									right: 12,
								}}
							>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="hour"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									tickFormatter={(value) =>
										new Date(value).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})
									}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} />
								<ChartTooltip
									cursor={false}
									content={<ChartTooltipContent indicator="line" />}
									labelFormatter={(value) =>
										new Date(value).toLocaleString([], {
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})
									}
								/>
								<Area
									dataKey="count"
									type="natural"
									fill="hsl(var(--chart-1))"
									fillOpacity={0.4}
									stroke="hsl(var(--chart-1))"
								/>
							</AreaChart>
						</ChartContainer>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			<div className="flex flex-col gap-6 w-full">
				<div className="mt-6 grid gap-4 pb-20 w-full">
					<div className="flex flex-col gap-4  w-full overflow-auto">
						<div className="flex items-center gap-2 max-sm:flex-wrap">
							<Input
								placeholder="Filter by name..."
								value={
									(table
										.getColumn("RequestPath")
										?.getFilterValue() as string) ?? ""
								}
								onChange={(event) =>
									table
										.getColumn("RequestPath")
										?.setFilterValue(event.target.value)
								}
								className="md:max-w-sm"
							/>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										className="sm:ml-auto max-sm:w-full"
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
						<div className="rounded-md border">
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
												{isLoading ? (
													<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
														<span className="text-muted-foreground text-lg font-medium">
															Loading...
														</span>
													</div>
												) : (
													<>No results.</>
												)}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className="flex items-center justify-end space-x-2 py-4">
							<div className="space-x-2 flex flex-wrap">
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
				<SheetContent className="w-[400px] sm:w-[540px] sm:max-w-none flex flex-col">
					<SheetHeader>
						<SheetTitle>Request log</SheetTitle>
						<SheetDescription>
							Details of the request log entry.
						</SheetDescription>
					</SheetHeader>
					<ScrollArea className="flex-grow mt-4 pr-4">
						<div className="border rounded-md">
							<Table>
								<TableBody>
									{Object.entries(requestLog).map(([key, value]) => (
										<TableRow key={key}>
											<TableCell className="font-medium">{key}</TableCell>
											<TableCell>
												{key === "id" ? (
													<div className="flex items-center gap-2 bg-muted p-1 rounded">
														<span>{value}</span>
														<Copy className="h-4 w-4 text-muted-foreground" />
													</div>
												) : key === "level" ? (
													<Badge variant="destructive">{value}</Badge>
												) : key === "data.error" ? (
													<Badge variant="destructive" className="font-normal">
														{value}
													</Badge>
												) : key === "data.details" ? (
													<div className="bg-muted p-2 rounded text-xs">
														{value}
													</div>
												) : (
													value
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</ScrollArea>
					<div className="mt-4 pt-4 border-t">
						<Button variant="outline" className="w-full gap-2">
							<Download className="h-4 w-4" />
							Download as JSON
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
};
