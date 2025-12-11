import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LogEntry } from "./show-requests";

export const getStatusColor = (status: number) => {
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

export const createColumns = (
	t: (key: string) => string,
): ColumnDef<LogEntry>[] => [
	{
		accessorKey: "level",
		header: () => {
			return <Button variant="ghost">{t("requests.columns.level")}</Button>;
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
					{t("requests.columns.message")}
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
						<Badge variant={getStatusColor(log.OriginStatus)}>
							{t("requests.columns.statusLabel")}:{" "}
							{log.OriginStatus}
						</Badge>
						<Badge variant={"secondary"}>
							{t("requests.columns.execTimeLabel")}:{" "}
							{`${log.Duration / 1000000000}s`}
						</Badge>
						<Badge variant={"secondary"}>
							{t("requests.columns.ipLabel")}:{" "}
							{log.ClientAddr}
						</Badge>
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
					{t("requests.columns.time")}
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
