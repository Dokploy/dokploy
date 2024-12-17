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
import { ShowNodeConfig } from "../details/show-node";
// import { ShowContainerConfig } from "../config/show-container-config";
// import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
// import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
// import type { Container } from "./show-containers";

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
}

export const columns: ColumnDef<ApplicationList>[] = [
	{
		accessorKey: "ID",
		accessorFn: (row) => row.ID,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					ID
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
					Name
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
					Image
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
					Mode
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
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Current State
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
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Desired State
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
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Replicas
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
					Ports
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
					Errors
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("Errors")}</div>;
		},
	},
];
