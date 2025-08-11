import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { type RouterOutputs, api } from "@/utils/api";
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
import { ChevronDown, Container } from "lucide-react";
import { useTranslation } from "next-i18next";
import * as React from "react";
import { createColumns } from "./colums";
export type Container = NonNullable<
	RouterOutputs["docker"]["getContainers"]
>[0];

interface Props {
	serverId?: string;
}

export const ShowContainers = ({ serverId }: Props) => {
	const { t } = useTranslation("dashboard");
	const columns = createColumns(t);
	const { data, isLoading } = api.docker.getContainers.useQuery({
		serverId,
	});

	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[],
	);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});

	const table = useReactTable({
		data: data ?? [],
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
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md ">
					<CardHeader className="">
						<CardTitle className="text-xl flex flex-row gap-2">
							<Container className="size-6 text-muted-foreground self-center" />
							{t("dashboard.docker.containers.title")}
						</CardTitle>
						<CardDescription>
							{t("dashboard.docker.containers.description")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<div className="gap-4 pb-20 w-full">
							<div className="flex flex-col gap-4  w-full overflow-auto">
								<div className="flex items-center gap-2 max-sm:flex-wrap">
									<Input
										placeholder={t("dashboard.docker.containers.filterByName")}
										value={
											(table.getColumn("name")?.getFilterValue() as string) ??
											""
										}
										onChange={(event) =>
											table
												.getColumn("name")
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
												{t("dashboard.docker.containers.columns")}{" "}
												<ChevronDown className="ml-2 h-4 w-4" />
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
									{isLoading ? (
										<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
											<span className="text-muted-foreground text-lg font-medium">
												{t("dashboard.docker.containers.loading")}
											</span>
										</div>
									) : data?.length === 0 ? (
										<div className="flex-col gap-2 flex items-center justify-center h-[55vh]">
											<span className="text-muted-foreground text-lg font-medium">
												{t("dashboard.docker.containers.noResults")}
											</span>
										</div>
									) : (
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
												{table?.getRowModel()?.rows?.length ? (
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
															{isLoading ? (
																<div className="w-full flex-col gap-2 flex items-center justify-center h-[55vh]">
																	<span className="text-muted-foreground text-lg font-medium">
																		{t("dashboard.docker.containers.loading")}
																	</span>
																</div>
															) : (
																<div className="flex-col gap-2 flex items-center justify-center h-[55vh]">
																	<span className="text-muted-foreground text-lg font-medium">
																		{t("dashboard.docker.containers.noResults")}
																	</span>
																</div>
															)}
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									)}
								</div>
								{data && data?.length > 0 && (
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
								)}
							</div>
						</div>
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
