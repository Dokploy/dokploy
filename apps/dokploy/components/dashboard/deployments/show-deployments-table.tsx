"use client";

import {
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import type { inferRouterOutputs } from "@trpc/server";
import {
	ArrowUpDown,
	Boxes,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Loader2,
	Rocket,
	Server,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type DeploymentRow =
	inferRouterOutputs<AppRouter>["deployment"]["allCentralized"][number];

const statusVariants: Record<
	string,
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "yellow"
	| "green"
	| "red"
	| "blue"
> = {
	queued: "blue",
	running: "yellow",
	done: "green",
	error: "red",
	cancelled: "outline",
};

function getServiceInfo(d: DeploymentRow) {
	const app = d.application;
	const comp = d.compose;
	if (app?.environment?.project && app.environment) {
		return {
			type: "Application" as const,
			name: app.name,
			projectId: app.environment.project.projectId,
			environmentId: app.environment.environmentId,
			projectName: app.environment.project.name,
			environmentName: app.environment.name,
			serviceId: app.applicationId,
			href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
		};
	}
	if (comp?.environment?.project && comp.environment) {
		return {
			type: "Compose" as const,
			name: comp.name,
			projectId: comp.environment.project.projectId,
			environmentId: comp.environment.environmentId,
			projectName: comp.environment.project.name,
			environmentName: comp.environment.name,
			serviceId: comp.composeId,
			href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
		};
	}
	return null;
}

export function ShowDeploymentsTable() {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "createdAt", desc: true },
	]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 50,
	});

	const { data: deploymentsList, isLoading } =
		api.deployment.allCentralized.useQuery(undefined, {
			refetchInterval: 5000,
		});

	const filteredData = useMemo(() => {
		if (!deploymentsList) return [];
		let list = deploymentsList;
		if (statusFilter !== "all") {
			list = list.filter((d) => d.status === statusFilter);
		}
		if (typeFilter === "application") {
			list = list.filter((d) => d.applicationId != null);
		} else if (typeFilter === "compose") {
			list = list.filter((d) => d.composeId != null);
		}
		if (globalFilter.trim()) {
			const q = globalFilter.toLowerCase();
			list = list.filter((d) => {
				const info = getServiceInfo(d);
				const serverName =
					d.server?.name ??
					d.application?.server?.name ??
					d.compose?.server?.name ??
					"";
				const buildServerName =
					d.buildServer?.name ?? d.application?.buildServer?.name ?? "";
				if (!info) return false;
				return (
					info.name.toLowerCase().includes(q) ||
					info.projectName.toLowerCase().includes(q) ||
					info.environmentName.toLowerCase().includes(q) ||
					(d.title?.toLowerCase().includes(q) ?? false) ||
					serverName.toLowerCase().includes(q) ||
					buildServerName.toLowerCase().includes(q)
				);
			});
		}
		return list;
	}, [deploymentsList, statusFilter, typeFilter, globalFilter]);

	const columns = useMemo(
		() => [
			{
				id: "serviceName",
				accessorFn: (row: DeploymentRow) => getServiceInfo(row)?.name ?? "",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Service
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const info = getServiceInfo(row.original);
					if (!info) return <span className="text-muted-foreground">—</span>;
					return (
						<div className="flex items-center gap-2">
							{info.type === "Application" ? (
								<Rocket className="size-4 text-muted-foreground shrink-0" />
							) : (
								<Boxes className="size-4 text-muted-foreground shrink-0" />
							)}
							<div className="flex flex-col min-w-0">
								<span className="font-medium truncate">{info.name}</span>
								<Badge variant="outline" className="w-fit text-[10px]">
									{info.type}
								</Badge>
							</div>
						</div>
					);
				},
			},
			{
				id: "projectName",
				accessorFn: (row: DeploymentRow) =>
					getServiceInfo(row)?.projectName ?? "",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Project
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const info = getServiceInfo(row.original);
					return (
						<span className="text-muted-foreground">
							{info?.projectName ?? "—"}
						</span>
					);
				},
			},
			{
				id: "environmentName",
				accessorFn: (row: DeploymentRow) =>
					getServiceInfo(row)?.environmentName ?? "",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Environment
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const info = getServiceInfo(row.original);
					return (
						<span className="text-muted-foreground">
							{info?.environmentName ?? "—"}
						</span>
					);
				},
			},
			{
				id: "serverName",
				accessorFn: (row: DeploymentRow) =>
					row.server?.name ??
					row.application?.server?.name ??
					row.compose?.server?.name ??
					"",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Server
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const d = row.original;
					const serverName =
						d.server?.name ??
						d.application?.server?.name ??
						d.compose?.server?.name ??
						null;
					const serverType =
						d.server?.serverType ??
						d.application?.server?.serverType ??
						d.compose?.server?.serverType ??
						null;
					const buildServerName =
						d.buildServer?.name ?? d.application?.buildServer?.name ?? null;
					const buildServerType =
						d.buildServer?.serverType ??
						d.application?.buildServer?.serverType ??
						null;
					const showBuild =
						buildServerName != null && buildServerName !== serverName;
					if (!serverName && !showBuild) {
						return <span className="text-muted-foreground">—</span>;
					}
					return (
						<div className="flex flex-col gap-0.5 text-sm">
							{serverName && (
								<div className="flex items-center gap-1.5 flex-wrap">
									<Server className="size-3.5 text-muted-foreground shrink-0" />
									<span className="truncate">{serverName}</span>
									{serverType && (
										<Badge
											variant="outline"
											className="text-[10px] font-normal"
										>
											{serverType}
										</Badge>
									)}
								</div>
							)}
							{showBuild && buildServerName && (
								<div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
									<span className="text-[10px]">Build:</span>
									<span className="truncate text-xs">{buildServerName}</span>
									{buildServerType && (
										<Badge
											variant="outline"
											className="text-[10px] font-normal"
										>
											{buildServerType}
										</Badge>
									)}
								</div>
							)}
						</div>
					);
				},
			},
			{
				accessorKey: "title",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Title
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => (
					<span className="text-sm truncate max-w-[200px] block">
						{row.original.title || "—"}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Status
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const status = row.original.status ?? "running";
					return (
						<Badge variant={statusVariants[status] ?? "secondary"}>
							{status}
						</Badge>
					);
				},
			},
			{
				accessorKey: "createdAt",
				header: ({
					column,
				}: {
					column: {
						getIsSorted: () => false | "asc" | "desc";
						toggleSorting: (asc: boolean) => void;
					};
				}) => (
					<Button
						variant="ghost"
						className="-ml-3 h-8"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						Created
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: DeploymentRow } }) => (
					<span className="text-muted-foreground text-sm whitespace-nowrap">
						{row.original.createdAt
							? new Date(row.original.createdAt).toLocaleString()
							: "—"}
					</span>
				),
			},
			{
				header: "",
				id: "actions",
				enableSorting: false,
				cell: ({ row }: { row: { original: DeploymentRow } }) => {
					const info = getServiceInfo(row.original);
					if (!info) return null;
					return (
						<Button variant="ghost" size="sm" asChild>
							<Link href={info.href} className="gap-1">
								<ExternalLink className="size-4" />
								Open
							</Link>
						</Button>
					);
				},
			},
		],
		[],
	);

	const table = useReactTable({
		data: filteredData,
		columns,
		state: {
			sorting,
			columnFilters,
			globalFilter,
			pagination,
		},
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					placeholder="Search by name, project, environment, server..."
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="max-w-xs"
				/>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="queued">Queued</SelectItem>
						<SelectItem value="running">Running</SelectItem>
						<SelectItem value="done">Done</SelectItem>
						<SelectItem value="error">Error</SelectItem>
						<SelectItem value="cancelled">Cancelled</SelectItem>
					</SelectContent>
				</Select>
				<Select value={typeFilter} onValueChange={setTypeFilter}>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All types</SelectItem>
						<SelectItem value="application">Application</SelectItem>
						<SelectItem value="compose">Compose</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="px-0">
				{isLoading ? (
					<div className="flex gap-4 w-full items-center justify-center min-h-[45vh] text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						<span>Loading deployments...</span>
					</div>
				) : (
					<>
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
												className=" text-center"
											>
												<div className="flex flex-col min-h-[45vh] items-center justify-center gap-2 text-muted-foreground">
													<Rocket className="size-8" />
													<p className="font-medium">No deployments found</p>
													<p className="text-sm">
														Deployments from applications and compose will
														appear here.
													</p>
												</div>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className="flex flex-col gap-4 px-4 py-4 border-t sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-2 flex-wrap">
								<span className="text-sm text-muted-foreground whitespace-nowrap">
									Rows per page
								</span>
								<Select
									value={String(pagination.pageSize)}
									onValueChange={(value) => {
										setPagination((p) => ({
											...p,
											pageSize: Number(value),
											pageIndex: 0,
										}));
									}}
								>
									<SelectTrigger className="h-8 w-[70px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent side="top">
										{[10, 25, 50, 100].map((size) => (
											<SelectItem key={size} value={String(size)}>
												{size}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<span className="text-sm text-muted-foreground whitespace-nowrap">
									Showing{" "}
									{filteredData.length === 0
										? 0
										: pagination.pageIndex * pagination.pageSize + 1}{" "}
									to{" "}
									{Math.min(
										(pagination.pageIndex + 1) * pagination.pageSize,
										filteredData.length,
									)}{" "}
									of {filteredData.length} entries
								</span>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => table.previousPage()}
									disabled={!table.getCanPreviousPage()}
								>
									<ChevronLeft className="size-4" />
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => table.nextPage()}
									disabled={!table.getCanNextPage()}
								>
									Next
									<ChevronRight className="size-4" />
								</Button>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
