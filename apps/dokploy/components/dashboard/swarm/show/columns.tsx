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
import ShowNodeApplications from "../applications/show-applications";
import ShowContainers from "../containers/show-container";
import { ShowNodeConfig } from "../details/show-node";
// import { ShowContainerConfig } from "../config/show-container-config";
// import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
// import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
// import type { Container } from "./show-containers";

export interface SwarmList {
	ID: string;
	Hostname: string;
	Availability: string;
	EngineVersion: string;
	Status: string;
	ManagerStatus: string;
	TLSStatus: string;
}

export const columns: ColumnDef<SwarmList>[] = [
	{
		accessorKey: "ID",
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
		accessorKey: "EngineVersion",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Engine Version
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("EngineVersion")}</div>;
		},
	},
	{
		accessorKey: "Hostname",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Hostname
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			return <div>{row.getValue("Hostname")}</div>;
		},
	},
	//   {
	//     accessorKey: "Status",
	//     header: ({ column }) => {
	//       return (
	//         <Button
	//           variant="ghost"
	//           onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
	//         >
	//           Status
	//           <ArrowUpDown className="ml-2 h-4 w-4" />
	//         </Button>
	//       );
	//     },
	//     cell: ({ row }) => {
	//       const value = row.getValue("status") as string;
	//       return (
	//         <div className="capitalize">
	//           <Badge
	//             variant={
	//               value === "Ready"
	//                 ? "default"
	//                 : value === "failed"
	//                 ? "destructive"
	//                 : "secondary"
	//             }
	//           >
	//             {value}
	//           </Badge>
	//         </div>
	//       );
	//     },
	//   },
	{
		accessorKey: "Availability",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Availability
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const value = row.getValue("Availability") as string;
			return (
				<div className="capitalize">
					<Badge
						variant={
							value === "Active"
								? "default"
								: value === "Drain"
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
		accessorKey: "ManagerStatus",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					ManagerStatus
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => (
			<div className="lowercase">{row.getValue("ManagerStatus")}</div>
		),
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
						<ShowNodeConfig nodeId={row.original.ID} />
						<ShowNodeApplications nodeName={row.original.Hostname} />
						{/* <ShowDockerModalLogs
              containerId={container.containerId}
              serverId={container.serverId}
            >
              View Logs
            </ShowDockerModalLogs>
            <ShowContainerConfig
              containerId={container.containerId}
              serverId={container.serverId || ""}
            />
            <DockerTerminalModal
              containerId={container.containerId}
              serverId={container.serverId || ""}
            >
              Terminal
            </DockerTerminalModal> */}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
