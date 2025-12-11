import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShowDockerModalStackLogs } from "../../docker/logs/show-docker-modal-stack-logs";

export interface ApplicationList {
	ID: string;
	Image: string;
	Mode: string;
	Name: string;
	Ports: string;
	Replicas: string;
	CurrentState: string;
	DesiredState: string;
	Error: string;
	Node: string;
	serverId: string;
}

export const createSwarmColumns = (
	t: (key: string) => string,
): ColumnDef<ApplicationList>[] => {
	const translateMode = (mode?: string) => {
		if (!mode) return "";
		const key = mode.toLowerCase();
		if (key === "replicated") return t("swarm.applications.mode.replicated");
		if (key === "global") return t("swarm.applications.mode.global");
		return mode;
	};

	const translateState = (state?: string) => {
		if (!state) return "";
		const trimmed = state.trim();
		const [head, ...rest] = trimmed.split(" ");
		const headKey = head?.toLowerCase();
		const translatedHead =
			headKey === "running"
				? t("swarm.applications.state.running")
				: headKey === "shutdown"
					? t("swarm.applications.state.shutdown")
					: head;
		return [translatedHead, ...rest].join(" ").trim();
	};

	return [
		{
			accessorKey: "ID",
			accessorFn: (row) => row.ID,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.id")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("ID")}</div>;
			},
		},
		{
			accessorKey: "Name",
			accessorFn: (row) => row.Name,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.name")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("Name")}</div>;
			},
		},
		{
			accessorKey: "Image",
			accessorFn: (row) => row.Image,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.image")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("Image")}</div>;
			},
		},
		{
			accessorKey: "Mode",
			accessorFn: (row) => row.Mode,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.mode")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const value = row.getValue("Mode") as string;
				return <div className="capitalize">{translateMode(value)}</div>;
			},
		},
		{
			accessorKey: "CurrentState",
			accessorFn: (row) => row.CurrentState,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.currentState")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const value = row.getValue("CurrentState") as string;
				const valueStart = value.startsWith("Running")
					? "Running"
					: value.startsWith("Shutdown")
						? "Shutdown"
						: value;
				return (
					<div className="capitalize">
						<Badge
							variant={
								valueStart === "Running"
									? "default"
									: value === "Shutdown"
										? "destructive"
										: "secondary"
							}
						>
							{translateState(value)}
						</Badge>
					</div>
				);
			},
		},
		{
			accessorKey: "DesiredState",
			accessorFn: (row) => row.DesiredState,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.desiredState")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const value = row.getValue("DesiredState") as string;
				return <div className="capitalize">{translateState(value)}</div>;
			},
		},

		{
			accessorKey: "Replicas",
			accessorFn: (row) => row.Replicas,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.replicas")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("Replicas")}</div>;
			},
		},

		{
			accessorKey: "Ports",
			accessorFn: (row) => row.Ports,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.ports")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("Ports")}</div>;
			},
		},
		{
			accessorKey: "Errors",
			accessorFn: (row) => row.Error,
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("swarm.applications.table.errors")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="w-[10rem]">{row.getValue("Errors")}</div>;
			},
		},
		{
			accessorKey: "Logs",
			accessorFn: (row) => row.Error,
			header: () => {
				return <span>{t("swarm.applications.table.logs")}</span>;
			},
			cell: ({ row }) => {
				return (
					<span className="w-[10rem]">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="h-8 w-8 p-0">
									<span className="sr-only">{t("common.openMenu")}</span>
									<MoreHorizontal className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									{t("swarm.applications.actions.label")}
								</DropdownMenuLabel>
								<ShowDockerModalStackLogs
									containerId={row.original.ID}
									serverId={row.original.serverId}
								>
									{t("swarm.applications.actions.viewLogs")}
								</ShowDockerModalStackLogs>
							</DropdownMenuContent>
						</DropdownMenu>
					</span>
				);
			},
		},
	];
};
