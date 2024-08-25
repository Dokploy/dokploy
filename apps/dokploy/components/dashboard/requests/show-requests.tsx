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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ChevronDown, MoreHorizontal, TrendingUp } from "lucide-react";
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
import { useEffect } from "react";

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
export const ShowRequests = () => {
	const { data } = api.settings.readMonitoringConfig.useQuery(undefined, {
		refetchInterval: 1000,
	});
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
												{/* {isLoading ? (
											<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
												<span className="text-muted-foreground text-lg font-medium">
													Loading...
												</span>
											</div>
										) : (
											<>No results.</>
										)} */}
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
		</>
	);
};
