import { formatMb } from "@dokploy/server/monitoring/units";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, CircuitBoard, GlobeIcon } from "lucide-react";
import type { ComponentType } from "react";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { RouterOutputs } from "@/utils/api";

export type ServiceUsageRow = RouterOutputs["project"]["resourceUsage"][number];

const SERVICE_ICONS: Record<
	ServiceUsageRow["type"],
	ComponentType<{ className?: string }>
> = {
	application: GlobeIcon,
	compose: CircuitBoard,
	postgres: PostgresqlIcon,
	mysql: MysqlIcon,
	mariadb: MariadbIcon,
	redis: RedisIcon,
	mongo: MongodbIcon,
	libsql: LibsqlIcon,
};

const sortableHeader = (label: string) =>
	function SortableHeader({
		column,
	}: {
		column: {
			toggleSorting: (desc?: boolean) => void;
			getIsSorted: () => false | "asc" | "desc";
		};
	}) {
		return (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				{label}
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		);
	};

export const columns: ColumnDef<ServiceUsageRow>[] = [
	{
		accessorKey: "projectName",
		header: sortableHeader("Project"),
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium">{row.original.projectName}</span>
				<span className="text-xs text-muted-foreground">
					{row.original.environmentName}
				</span>
			</div>
		),
	},
	{
		accessorKey: "name",
		header: sortableHeader("Service"),
		cell: ({ row }) => {
			const Icon = SERVICE_ICONS[row.original.type];
			return (
				<div className="flex items-center gap-2">
					<Icon className="size-4 shrink-0 text-muted-foreground" />
					<span>{row.original.name}</span>
				</div>
			);
		},
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status = row.original.status as
				| "running"
				| "error"
				| "done"
				| "idle"
				| null;
			return <StatusTooltip status={status} />;
		},
	},
	{
		id: "containers",
		accessorFn: (row) => row.containers.length,
		header: sortableHeader("Containers"),
		cell: ({ row }) => (
			<Badge variant="outline">{row.original.containers.length}</Badge>
		),
	},
	{
		accessorKey: "cpuPercent",
		header: sortableHeader("CPU"),
		cell: ({ row }) => {
			const value = row.original.cpuPercent;
			return (
				<div className="flex flex-col gap-1 min-w-32">
					<span className="text-sm">{value.toFixed(1)}%</span>
					<Progress value={Math.min(value, 100)} className="h-1.5 w-32" />
				</div>
			);
		},
	},
	{
		accessorKey: "memUsedMb",
		header: sortableHeader("Memory"),
		cell: ({ row }) => {
			const { memUsedMb, memLimitMb } = row.original;
			const percentage = memLimitMb > 0 ? (memUsedMb / memLimitMb) * 100 : 0;
			return (
				<div className="flex flex-col gap-1 min-w-40">
					<span className="text-sm">
						{formatMb(memUsedMb)}
						{memLimitMb > 0 ? ` / ${formatMb(memLimitMb)}` : ""}
					</span>
					<Progress value={Math.min(percentage, 100)} className="h-1.5 w-32" />
				</div>
			);
		},
	},
	{
		accessorKey: "diskUsedMb",
		header: sortableHeader("Storage"),
		cell: ({ row }) => (
			<span className="text-sm">{formatMb(row.original.diskUsedMb)}</span>
		),
	},
];
