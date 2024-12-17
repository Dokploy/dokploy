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

import type { Badge } from "@/components/ui/badge";
import { ShowNodeConfig } from "../details/show-node";
// import { ShowContainerConfig } from "../config/show-container-config";
// import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
// import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
// import type { Container } from "./show-containers";

export interface ContainerList {
	containerId: string;
	name: string;
	image: string;
	ports: string;
	state: string;
	status: string;
	serverId: string | null | undefined;
}

export const columns: ColumnDef<ContainerList>[] = [
	{
		accessorKey: "ID",
		accessorFn: (row) => row.containerId,
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
			return <div>{row.getValue("containerId")}</div>;
		},
	},
	{
		accessorKey: "Name",
		accessorFn: (row) => row.name,
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
			return <div>{row.getValue("name")}</div>;
		},
	},
	{
		accessorKey: "Image",
		accessorFn: (row) => row.image,
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
			return <div>{row.getValue("image")}</div>;
		},
	},
	{
		accessorKey: "Ports",
		accessorFn: (row) => row.ports,
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
			return <div>{row.getValue("ports")}</div>;
		},
	},
	{
		accessorKey: "State",
		accessorFn: (row) => row.state,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					State
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("state")}</div>;
		},
	},
	{
		accessorKey: "Status",
		accessorFn: (row) => row.status,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Status
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("status")}</div>;
		},
	},
];
