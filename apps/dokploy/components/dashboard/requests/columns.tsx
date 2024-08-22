import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "./show-requests";
import { format } from "date-fns";

export const columns: ColumnDef<LogEntry>[] = [
	{
		accessorKey: "level",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Level
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
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
				<div className=" flex flex-col gap-2">
					<div>
						{log.RequestMethod} {log.RequestPath}
					</div>
					<div className="flex flex-row gap-3 w-full">
						<Badge
							variant={log.OriginStatus <= 200 ? "default" : "destructive"}
						>
							Status: {log.OriginStatus}
						</Badge>
						<Badge variant={"secondary"}>
							Exec Time: {convertMicroseconds(log.Duration)}
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
				<div className=" flex flex-col gap-2">
					<div className="flex flex-row gap-3 w-full">
						{format(new Date(log.time), "yyyy-MM-dd HH:mm:ss")}
					</div>
				</div>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const container = row.original;

			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						{/* <ShowDockerModalLogs containerId={container.containerId}>
							View Logs
						</ShowDockerModalLogs>
						<ShowContainerConfig containerId={container.containerId} />
						<DockerTerminalModal containerId={container.containerId}>
							Terminal
						</DockerTerminalModal> */}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
function convertMicroseconds(microseconds: number): string {
	if (microseconds < 1000) {
		return `${microseconds} µs`;
	}
	if (microseconds < 1000000) {
		return `${(microseconds / 1000).toFixed(2)} ms`;
	}
	return `${(microseconds / 1000000).toFixed(2)} s`;
}
