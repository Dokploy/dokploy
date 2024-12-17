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
import { ShowContainers } from "../../docker/show/show-containers";
import ShowNodeContainers from "../containers/show-container";
import { ShowNodeConfig } from "../details/show-node";
// import { ShowContainerConfig } from "../config/show-container-config";
// import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
// import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
// import type { Container } from "./show-containers";

export interface ServerList {
	totalSum: number;
	serverId: string;
	name: string;
	description: string | null;
	ipAddress: string;
	port: number;
	username: string;
	appName: string;
	enableDockerCleanup: boolean;
	createdAt: string;
	adminId: string;
	serverStatus: "active" | "inactive";
	command: string;
	sshKeyId: string | null;
}

export const columns: ColumnDef<ServerList>[] = [
	{
		accessorKey: "serverId",
		accessorFn: (row) => row.serverId,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Server ID
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("serverId")}</div>;
		},
	},
	{
		accessorKey: "name",
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
		accessorKey: "ipAddress",
		accessorFn: (row) => row.ipAddress,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					IP Address
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("ipAddress")}</div>;
		},
	},
	{
		accessorKey: "port",
		accessorFn: (row) => row.port,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Port
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("port")}</div>;
		},
	},
	{
		accessorKey: "username",
		accessorFn: (row) => row.username,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Username
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("username")}</div>;
		},
	},
	{
		accessorKey: "createdAt",
		accessorFn: (row) => row.createdAt,
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Created at
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("createdAt")}</div>;
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
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
						<ShowNodeContainers serverId={row.original.serverId} />
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
