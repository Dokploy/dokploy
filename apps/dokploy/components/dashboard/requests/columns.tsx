import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LogEntry } from "./show-requests";

export const getStatusColor = (status: number) => {
	if (status === 0) {
		return "secondary";
	}
	if (status >= 100 && status < 200) {
		return "outline";
	}
	if (status >= 200 && status < 300) {
		return "default";
	}
	if (status >= 300 && status < 400) {
		return "outline";
	}
	if (status >= 400 && status < 500) {
		return "destructive";
	}
	return "destructive";
};

const formatStatusLabel = (status: number) => {
	if (status === 0) {
		return "N/A";
	}
	return status;
};

const formatDuration = (nanos: number) => {
	const ms = nanos / 1000000;
	if (ms < 1) {
		return `${(nanos / 1000).toFixed(2)} µs`;
	}
	if (ms < 1000) {
		return `${ms.toFixed(2)} ms`;
	}
	return `${(ms / 1000).toFixed(2)} s`;
};

export const columns: ColumnDef<LogEntry>[] = [
	{
		accessorKey: "level",
		header: () => {
			return <Button variant="ghost">Level</Button>;
		},
		cell: ({ row }) => {
			return <div>{row.original.level}</div>;
		},
	},
	{
		accessorKey: "RequestPath",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Message
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const log = row.original;
			return (
				<div className="flex flex-col gap-2">
					<div className="flex items-center flex-row gap-3 ">
						{log.RequestMethod}{" "}
						<div className="inline-flex items-center gap-2 bg-muted px-1.5 py-1 rounded-lg">
							<span>{log.RequestAddr}</span>
						</div>
						{log.RequestPath.length > 100
							? `${log.RequestPath.slice(0, 82)}...`
							: log.RequestPath}
					</div>
					<div className="flex flex-row gap-3 w-full">
						<Badge
							variant={getStatusColor(log.OriginStatus || log.DownstreamStatus)}
						>
							Status:{" "}
							{formatStatusLabel(log.OriginStatus || log.DownstreamStatus)}
						</Badge>
						<Badge variant={"secondary"}>
							Exec Time: {formatDuration(log.Duration)}
						</Badge>
						<Badge variant={"secondary"}>IP: {log.ClientAddr}</Badge>
					</div>
				</div>
			);
		},
	},
	{
		accessorKey: "time",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Time
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const log = row.original;
			return (
				<div className="flex flex-col gap-2">
					<div className="flex flex-row gap-3 w-full">
						{format(new Date(log.StartUTC), "yyyy-MM-dd HH:mm:ss")}
					</div>
				</div>
			);
		},
	},
];
