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
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
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
import { columns } from "./colums";
import { Skeleton } from "@/components/ui/skeleton";
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

	if (isLoading) {
		return (
			<div className="mt-6 grid gap-4 pb-20 w-full">
			<div className="flex flex-col gap-4 w-full overflow-auto">
			  <div className="flex items-center gap-2 max-sm:flex-wrap">
				<Skeleton className="h-10 md:max-w-sm w-full" />
				<Skeleton className="h-10 w-32 sm:ml-auto max-sm:w-full" />
			  </div>
			  <div className="rounded-md border">
				<Table>
				  <TableHeader>
					<TableRow>
					  <TableHead className="w-[40%]"><Skeleton className="h-4 w-32" /></TableHead>
					  <TableHead className="w-[20%]"><Skeleton className="h-4 w-20" /></TableHead>
					  <TableHead className="w-[20%]"><Skeleton className="h-4 w-24" /></TableHead>
					  <TableHead className="w-[20%]"><Skeleton className="h-4 w-20" /></TableHead>
					</TableRow>
				  </TableHeader>
				  <TableBody>
					{Array.from({ length: 12 }).map((_, i) => (
					  <TableRow key={i} className="h-16">
						<TableCell><Skeleton className="h-4 w-[90%]" /></TableCell>
						<TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
						<TableCell><Skeleton className="h-4 w-32" /></TableCell>
						<TableCell><Skeleton className="h-4 w-40" /></TableCell>
					  </TableRow>
					))}
				  </TableBody>
				</Table>
			  </div>
			  <div className="flex items-center justify-end space-x-2 py-4">
				<div className="space-x-2 flex flex-wrap">
				  <Skeleton className="h-9 w-20" />
				  <Skeleton className="h-9 w-20" />
				</div>
			  </div>
			</div>
		  </div>
		)
	  }

	return (
		<div className="mt-6 grid gap-4 pb-20 w-full">
			<div className="flex flex-col gap-4  w-full overflow-auto">
				<div className="flex items-center gap-2 max-sm:flex-wrap">
					<Input
						placeholder="Filter by name..."
						value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
						onChange={(event) =>
							table.getColumn("name")?.setFilterValue(event.target.value)
						}
						className="md:max-w-sm"
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" className="sm:ml-auto max-sm:w-full">
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
					{data?.length === 0 ? (
						<div className="flex-col gap-2 flex items-center justify-center h-[55vh]">
							<span className="text-muted-foreground text-lg font-medium">
								No results.
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
	);
};
