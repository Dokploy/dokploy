import {
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, Container } from "lucide-react";
import * as React from "react";
import { ListSkeleton } from "@/components/shared/list-skeleton";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
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
import { api, type RouterOutputs } from "@/utils/api";
import { columns } from "./colums";
export type Container = NonNullable<
	RouterOutputs["docker"]["getContainers"]
>[0];

interface Props {
	serverId?: string;
}

export const ShowContainers = ({ serverId }: Props) => {
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
							Docker Containers
						</CardTitle>
						<CardDescription>
							See all the containers of your dokploy server
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<div className="gap-4 pb-20 w-full">
							<div className="flex flex-col gap-4  w-full overflow-auto">
								<div className="flex items-center gap-2 max-sm:flex-wrap">
									<Input
										placeholder="Filter by name..."
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
									{isLoading ? (
										<div className="p-4">
											<ListSkeleton
												items={6}
												gridClassName="grid grid-cols-1 gap-3"
												itemClassName="border-none bg-transparent p-0"
											/>
										</div>
									) : data?.length === 0 ? (
										<Empty className="min-h-[55vh]">
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<Container className="size-5 text-muted-foreground" />
												</EmptyMedia>
												<EmptyTitle>No containers found</EmptyTitle>
												<EmptyDescription>
													Containers will appear here once they're running.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
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
															<Empty className="border-none p-4">
																<EmptyHeader>
																	<EmptyTitle>No results.</EmptyTitle>
																</EmptyHeader>
															</Empty>
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
