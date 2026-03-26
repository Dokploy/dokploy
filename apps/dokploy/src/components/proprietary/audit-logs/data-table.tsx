"use client";

import type { AuditLog } from "@dokploy/server/db/schema";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, X } from "lucide-react";
import React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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

const ACTION_OPTIONS = [
	{ value: "create", label: "Created" },
	{ value: "update", label: "Updated" },
	{ value: "delete", label: "Deleted" },
	{ value: "deploy", label: "Deployed" },
	{ value: "cancel", label: "Cancelled" },
	{ value: "redeploy", label: "Redeployed" },
	{ value: "login", label: "Login" },
	{ value: "logout", label: "Logout" },
];

const RESOURCE_OPTIONS = [
	{ value: "project", label: "Projects" },
	{ value: "service", label: "Applications / Services" },
	{ value: "environment", label: "Environments" },
	{ value: "deployment", label: "Deployments" },
	{ value: "user", label: "Users" },
	{ value: "customRole", label: "Custom Roles" },
	{ value: "domain", label: "Domains" },
	{ value: "certificate", label: "Certificates" },
	{ value: "registry", label: "Registries" },
	{ value: "server", label: "Remote Servers" },
	{ value: "sshKey", label: "SSH Keys" },
	{ value: "gitProvider", label: "Git Providers" },
	{ value: "notification", label: "Notifications" },
	{ value: "settings", label: "Settings" },
	{ value: "session", label: "Sessions (Login/Logout)" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

type AuditAction =
	| "create"
	| "update"
	| "delete"
	| "deploy"
	| "cancel"
	| "redeploy"
	| "login"
	| "logout";
type AuditResourceType =
	| "project"
	| "service"
	| "environment"
	| "deployment"
	| "user"
	| "customRole"
	| "domain"
	| "certificate"
	| "registry"
	| "server"
	| "sshKey"
	| "gitProvider"
	| "notification"
	| "settings"
	| "session";

export interface AuditLogFilters {
	userEmail: string;
	resourceName: string;
	action: AuditAction | "";
	resourceType: AuditResourceType | "";
	dateRange: DateRange | undefined;
}

interface DataTableProps {
	columns: ColumnDef<AuditLog>[];
	data: AuditLog[];
	total: number;
	pageIndex: number;
	pageSize: number;
	filters: AuditLogFilters;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	onFilterChange: <K extends keyof AuditLogFilters>(
		key: K,
		value: AuditLogFilters[K],
	) => void;
	isLoading?: boolean;
}

export function DataTable({
	columns,
	data,
	total,
	pageIndex,
	pageSize,
	filters,
	onPageChange,
	onPageSizeChange,
	onFilterChange,
	isLoading,
}: DataTableProps) {
	const [sorting, setSorting] = React.useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});

	const table = useReactTable({
		data,
		columns,
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		manualPagination: true,
		manualFiltering: true,
		rowCount: total,
		state: {
			sorting,
			columnVisibility,
		},
	});

	const pageCount = Math.ceil(total / pageSize);
	const hasFilters =
		filters.userEmail ||
		filters.resourceName ||
		filters.action ||
		filters.resourceType ||
		filters.dateRange;

	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="flex items-center gap-2 flex-wrap">
				<Input
					placeholder="Filter by user..."
					value={filters.userEmail}
					onChange={(e) => onFilterChange("userEmail", e.target.value)}
					className="max-w-xs"
				/>
				<Input
					placeholder="Filter by name..."
					value={filters.resourceName}
					onChange={(e) => onFilterChange("resourceName", e.target.value)}
					className="max-w-xs"
				/>
				<Select
					value={filters.action || "__all__"}
					onValueChange={(value) =>
						onFilterChange(
							"action",
							value === "__all__" ? "" : (value as AuditAction),
						)
					}
				>
					<SelectTrigger className="w-[160px]">
						<SelectValue placeholder="All actions" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All actions</SelectItem>
						{ACTION_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.resourceType || "__all__"}
					onValueChange={(value) =>
						onFilterChange(
							"resourceType",
							value === "__all__" ? "" : (value as AuditResourceType),
						)
					}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="All resources" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">All resources</SelectItem>
						{RESOURCE_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="h-9 gap-1.5 text-sm font-normal"
						>
							<CalendarIcon className="h-4 w-4" />
							{filters.dateRange?.from ? (
								filters.dateRange.to ? (
									`${format(filters.dateRange.from, "MMM d")} – ${format(filters.dateRange.to, "MMM d, yyyy")}`
								) : (
									format(filters.dateRange.from, "MMM d, yyyy")
								)
							) : (
								<span className="text-muted-foreground">Date range</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							mode="range"
							selected={filters.dateRange}
							onSelect={(range) => onFilterChange("dateRange", range)}
							numberOfMonths={2}
							initialFocus
						/>
					</PopoverContent>
				</Popover>
				{hasFilters && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							onFilterChange("userEmail", "");
							onFilterChange("resourceName", "");
							onFilterChange("action", "");
							onFilterChange("resourceType", "");
							onFilterChange("dateRange", undefined);
						}}
						className="text-muted-foreground"
					>
						<X className="h-4 w-4 mr-1" />
						Clear
					</Button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="ml-auto">
							Columns <ChevronDown className="ml-2 h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{table
							.getAllColumns()
							.filter((col) => col.getCanHide())
							.map((col) => (
								<DropdownMenuCheckboxItem
									key={col.id}
									className="capitalize"
									checked={col.getIsVisible()}
									onCheckedChange={(value) => col.toggleVisibility(!!value)}
								>
									{col.id}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="rounded-md border overflow-auto">
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
						{isLoading ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center text-muted-foreground"
								>
									Loading...
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows.length ? (
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
									No audit logs found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between text-sm text-muted-foreground">
				<span>
					{total} {total === 1 ? "entry" : "entries"} total
				</span>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2">
						<span className="text-sm whitespace-nowrap">Rows per page</span>
						<Select
							value={String(pageSize)}
							onValueChange={(value) => onPageSizeChange(Number(value))}
						>
							<SelectTrigger className="w-[80px] h-8">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAGE_SIZE_OPTIONS.map((size) => (
									<SelectItem key={size} value={String(size)}>
										{size}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<span className="whitespace-nowrap">
						Page {pageIndex + 1} of {Math.max(1, pageCount)}
					</span>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(pageIndex - 1)}
							disabled={pageIndex === 0}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onPageChange(pageIndex + 1)}
							disabled={pageIndex + 1 >= pageCount}
						>
							Next
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
