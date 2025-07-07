import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "next-i18next";
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

export const columns: ColumnDef<ApplicationList>[] = [
	{
		accessorKey: "ID",
		accessorFn: (row) => row.ID,
		header: ({ column }) => {
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.id")}
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
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.name")}
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
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.image")}
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
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.mode")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("Mode")}</div>;
		},
	},
	{
		accessorKey: "CurrentState",
		accessorFn: (row) => row.CurrentState,
		header: ({ column }) => {
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.currentState")}
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
						{value}
					</Badge>
				</div>
			);
		},
	},
	{
		accessorKey: "DesiredState",
		accessorFn: (row) => row.DesiredState,
		header: ({ column }) => {
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.desiredState")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("DesiredState")}</div>;
		},
	},

	{
		accessorKey: "Replicas",
		accessorFn: (row) => row.Replicas,
		header: ({ column }) => {
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.replicas")}
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
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.ports")}
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
			const { t } = useTranslation("dashboard");
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("dashboard.swarm.columns.errors")}
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
			const { t } = useTranslation("dashboard");
			return <span>{t("dashboard.swarm.columns.logs")}</span>;
		},
		cell: ({ row }) => {
			const { t } = useTranslation("dashboard");
			return (
				<span className="w-[10rem]">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="h-8 w-8 p-0">
								<span className="sr-only">
									{t("dashboard.swarm.columns.openMenu")}
								</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>
								{t("dashboard.swarm.columns.actions")}
							</DropdownMenuLabel>
							<ShowDockerModalStackLogs
								containerId={row.original.ID}
								serverId={row.original.serverId}
							>
								{t("dashboard.swarm.columns.viewLogs")}
							</ShowDockerModalStackLogs>
						</DropdownMenuContent>
					</DropdownMenu>
				</span>
			);
		},
	},
];
