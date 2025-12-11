"use client";

import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import {
	type ColumnDef,
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
import { ChevronDown } from "lucide-react";
import { useTranslation } from "next-i18next";
import React from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
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

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
}

const getSwarmColumnLabel = (columnId: string, t: (key: string) => string) => {
	const columnLabelMap: Record<string, string> = {
		ID: t("swarm.applications.table.id"),
		Name: t("swarm.applications.table.name"),
		Image: t("swarm.applications.table.image"),
		Mode: t("swarm.applications.table.mode"),
		CurrentState: t("swarm.applications.table.currentState"),
		DesiredState: t("swarm.applications.table.desiredState"),
		Replicas: t("swarm.applications.table.replicas"),
		Ports: t("swarm.applications.table.ports"),
		Errors: t("swarm.applications.table.errors"),
		Logs: t("swarm.applications.table.logs"),
	};
	return columnLabelMap[columnId] || columnId;
};

export function DataTable<TData, TValue>({
	columns,
	data,
}: DataTableProps<TData, TValue>) {
	const { t } = useTranslation("common");
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[],
	);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});
	const [_pagination, _setPagination] = React.useState({
		pageIndex: 0, //initial page index
		pageSize: 8, //default page size
	});

	const table = useReactTable({
		data,
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
		<div className="mt-6 grid gap-4 pb-20 w-full">
			<div className="flex flex-col gap-4  </div>w-full overflow-auto">
				<div className="flex items-center gap-2 max-sm:flex-wrap">
					<Input
						placeholder={t("swarm.applications.filterPlaceholder")}
						value={(table.getColumn("Name")?.getFilterValue() as string) ?? ""}
						onChange={(event) =>
							table.getColumn("Name")?.setFilterValue(event.target.value)
						}
						className="md:max-w-sm"
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" className="sm:ml-auto max-sm:w-full">
								{t("table.columns")} <ChevronDown className="ml-2 h-4 w-4" />
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
											{getSwarmColumnLabel(column.id, t)}
										</DropdownMenuCheckboxItem>
									);
								})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
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
									{t("search.noResults")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>

				{data && data?.length > 0 && (
					<div className="flex items-center justify-end space-x-2 py-4">
						<div className="space-x-2 flex flex-wrap">
							<Button
								variant="outline"
								size="sm"
								onClick={() => table.previousPage()}
								disabled={!table.getCanPreviousPage()}
							>
								{t("pagination.prev")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => table.nextPage()}
								disabled={!table.getCanNextPage()}
							>
								{t("pagination.next")}
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
