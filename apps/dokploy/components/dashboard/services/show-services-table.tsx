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
import { formatDistanceToNow } from "date-fns";
import {
	ArrowUpDown,
	Boxes,
	ChevronLeft,
	ChevronRight,
	CircuitBoard,
	ExternalLink,
	GlobeIcon,
	Layers,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	extractServices,
	type Services,
} from "@/components/dashboard/settings/users/add-permissions";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { StatusTooltip } from "@/components/shared/status-tooltip";
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

type ProjectRow = inferRouterOutputs<AppRouter>["project"]["all"][number];
type DeploymentRow =
	inferRouterOutputs<AppRouter>["deployment"]["allCentralized"][number];

type ServiceRow = Services & {
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
	href: string;
	lastDeployment: {
		createdAt: string;
		status: DeploymentRow["status"];
	} | null;
};

const statusVariants: Record<
	string,
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "yellow"
	| "green"
	| "red"
> = {
	running: "yellow",
	done: "green",
	error: "red",
	cancelled: "outline",
	idle: "secondary",
};

const typeLabels: Record<ServiceRow["type"], string> = {
	application: "Application",
	compose: "Compose",
	postgres: "Postgres",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
	redis: "Redis",
	libsql: "LibSQL",
};

function ServiceTypeIcon({ type }: { type: ServiceRow["type"] }) {
	const className = "size-4 text-muted-foreground shrink-0";
	switch (type) {
		case "application":
			return <GlobeIcon className={className} />;
		case "compose":
			return <CircuitBoard className={className} />;
		case "postgres":
			return <PostgresqlIcon className="h-4 w-4 mr-0 shrink-0" />;
		case "redis":
			return <RedisIcon className="h-4 w-4 mr-0 shrink-0" />;
		case "mariadb":
			return <MariadbIcon className="h-4 w-4 mr-0 shrink-0" />;
		case "mongo":
			return <MongodbIcon className="h-4 w-4 mr-0 shrink-0" />;
		case "mysql":
			return <MysqlIcon className="h-4 w-4 mr-0 shrink-0" />;
		case "libsql":
			return <Boxes className={className} />;
		default:
			return <Layers className={className} />;
	}
}

function buildLatestDeploymentMap(deployments: DeploymentRow[] | undefined) {
	const map = new Map<
		string,
		{ createdAt: string; status: DeploymentRow["status"] }
	>();
	if (!deployments) return map;

	for (const deployment of deployments) {
		const serviceId = deployment.applicationId ?? deployment.composeId;
		if (!serviceId || !deployment.createdAt) continue;

		const existing = map.get(serviceId);
		if (
			!existing ||
			new Date(deployment.createdAt).getTime() >
				new Date(existing.createdAt).getTime()
		) {
			map.set(serviceId, {
				createdAt: deployment.createdAt,
				status: deployment.status,
			});
		}
	}

	return map;
}

function flattenServices(
	projects: ProjectRow[] | undefined,
	latestByServiceId: Map<
		string,
		{ createdAt: string; status: DeploymentRow["status"] }
	>,
): ServiceRow[] {
	if (!projects) return [];

	const rows: ServiceRow[] = [];

	for (const project of projects) {
		for (const environment of project.environments ?? []) {
			const services = extractServices(environment as never).filter((service) =>
				Boolean(service.id && service.name),
			);

			for (const service of services) {
				rows.push({
					...service,
					projectId: project.projectId,
					projectName: project.name,
					environmentId: environment.environmentId,
					environmentName: environment.name,
					href: `/dashboard/project/${project.projectId}/environment/${environment.environmentId}/services/${service.type}/${service.id}`,
					lastDeployment: latestByServiceId.get(service.id) ?? null,
				});
			}
		}
	}

	rows.sort((a, b) => {
		const byProject = a.projectName.localeCompare(b.projectName);
		if (byProject !== 0) return byProject;
		const byEnv = a.environmentName.localeCompare(b.environmentName);
		if (byEnv !== 0) return byEnv;
		return a.name.localeCompare(b.name);
	});

	return rows;
}

export function ShowServicesTable() {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "projectName", desc: false },
		{ id: "environmentName", desc: false },
		{ id: "name", desc: false },
	]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [typeFilter, setTypeFilter] = useState<string>("all");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 50,
	});

	const { data: permissions } = api.user.getPermissions.useQuery();
	const canReadDeployments = !!permissions?.deployment.read;

	const { data: projects, isLoading: isLoadingProjects } =
		api.project.all.useQuery();
	const { data: deployments, isLoading: isLoadingDeployments } =
		api.deployment.allCentralized.useQuery(undefined, {
			enabled: canReadDeployments,
			refetchInterval: 10000,
		});

	const isLoading =
		isLoadingProjects || (canReadDeployments && isLoadingDeployments);

	const latestByServiceId = useMemo(
		() =>
			buildLatestDeploymentMap(canReadDeployments ? deployments : undefined),
		[canReadDeployments, deployments],
	);

	const serviceRows = useMemo(
		() => flattenServices(projects, latestByServiceId),
		[projects, latestByServiceId],
	);

	const filteredData = useMemo(() => {
		let list = serviceRows;
		if (statusFilter !== "all") {
			list = list.filter((row) => row.status === statusFilter);
		}
		if (typeFilter !== "all") {
			list = list.filter((row) => row.type === typeFilter);
		}
		if (globalFilter.trim()) {
			const q = globalFilter.toLowerCase();
			list = list.filter(
				(row) =>
					row.name.toLowerCase().includes(q) ||
					row.projectName.toLowerCase().includes(q) ||
					row.environmentName.toLowerCase().includes(q) ||
					row.type.toLowerCase().includes(q),
			);
		}
		return list;
	}, [serviceRows, statusFilter, typeFilter, globalFilter]);

	const columns = useMemo(
		() => [
			{
				id: "name",
				accessorKey: "name",
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
						Name
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: ServiceRow } }) => {
					const service = row.original;
					return (
						<div className="flex items-center gap-2 min-w-0">
							<ServiceTypeIcon type={service.type} />
							<div className="flex flex-col min-w-0">
								<Link
									href={service.href}
									className="font-medium truncate hover:underline"
								>
									{service.name}
								</Link>
								<Badge variant="outline" className="w-fit text-[10px]">
									{typeLabels[service.type]}
								</Badge>
							</div>
						</div>
					);
				},
			},
			{
				id: "projectName",
				accessorKey: "projectName",
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
				cell: ({ row }: { row: { original: ServiceRow } }) => (
					<span className="text-sm truncate max-w-[180px] block">
						{row.original.projectName}
					</span>
				),
			},
			{
				id: "environmentName",
				accessorKey: "environmentName",
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
				cell: ({ row }: { row: { original: ServiceRow } }) => (
					<span className="text-sm truncate max-w-[140px] block">
						{row.original.environmentName}
					</span>
				),
			},
			{
				id: "status",
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
				cell: ({ row }: { row: { original: ServiceRow } }) => (
					<div className="flex items-center gap-2">
						<StatusTooltip status={row.original.status} />
						<span className="text-sm capitalize text-muted-foreground">
							{row.original.status ?? "—"}
						</span>
					</div>
				),
			},
			{
				id: "lastDeployment",
				accessorFn: (row: ServiceRow) =>
					row.lastDeployment?.createdAt
						? new Date(row.lastDeployment.createdAt).getTime()
						: 0,
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
						Last deployment
						<ArrowUpDown className="ml-2 size-4" />
					</Button>
				),
				cell: ({ row }: { row: { original: ServiceRow } }) => {
					const last = row.original.lastDeployment;
					if (!canReadDeployments || !last) {
						return <span className="text-muted-foreground">—</span>;
					}
					const status = last.status ?? "idle";
					return (
						<div className="flex items-center gap-2 whitespace-nowrap">
							<Badge variant={statusVariants[status] ?? "secondary"}>
								{status}
							</Badge>
							<span className="text-sm text-muted-foreground">
								{formatDistanceToNow(new Date(last.createdAt), {
									addSuffix: true,
								})}
							</span>
						</div>
					);
				},
			},
			{
				header: "",
				id: "actions",
				enableSorting: false,
				cell: ({ row }: { row: { original: ServiceRow } }) => (
					<Button variant="ghost" size="sm" asChild>
						<Link href={row.original.href} className="gap-1">
							<ExternalLink className="size-4" />
							Open
						</Link>
					</Button>
				),
			},
		],
		[canReadDeployments],
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
		enableMultiSort: true,
	});

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					placeholder="Search by name, project, environment..."
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
						<SelectItem value="running">Running</SelectItem>
						<SelectItem value="done">Done</SelectItem>
						<SelectItem value="error">Error</SelectItem>
						<SelectItem value="idle">Idle</SelectItem>
					</SelectContent>
				</Select>
				<Select value={typeFilter} onValueChange={setTypeFilter}>
					<SelectTrigger className="w-[160px]">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All types</SelectItem>
						<SelectItem value="application">Application</SelectItem>
						<SelectItem value="compose">Compose</SelectItem>
						<SelectItem value="postgres">Postgres</SelectItem>
						<SelectItem value="mysql">MySQL</SelectItem>
						<SelectItem value="mariadb">MariaDB</SelectItem>
						<SelectItem value="mongo">MongoDB</SelectItem>
						<SelectItem value="redis">Redis</SelectItem>
						<SelectItem value="libsql">LibSQL</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="px-0">
				{isLoading ? (
					<div className="flex gap-4 w-full items-center justify-center min-h-[45vh] text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						<span>Loading services...</span>
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
													<Layers className="size-8" />
													<p className="font-medium">No services found</p>
													<p className="text-sm">
														Services from your projects will appear here.
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
