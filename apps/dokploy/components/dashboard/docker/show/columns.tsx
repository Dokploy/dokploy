import type { ColumnDef } from "@tanstack/react-table";
import copy from "copy-to-clipboard";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShowContainerConfig } from "../config/show-container-config";
import { FilesExplorerModal } from "../files/files-explorer-modal";
import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
import { ShowContainerMounts } from "../mounts/show-container-mounts";
import { ShowContainerNetworks } from "../networks/show-container-networks";
import { RemoveContainerDialog } from "../remove/remove-container";
import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
import { UploadFileModal } from "../upload/upload-file-modal";
import type { Container } from "./show-containers";

export const useContainerColumns = (): ColumnDef<Container>[] => {
	const { t } = useTranslation();

	return [
		{
			accessorKey: "name",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("docker.containers.name")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div>{row.getValue("name")}</div>;
			},
		},
		{
			accessorKey: "state",
			filterFn: "equals",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("docker.containers.state")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const value = row.getValue("state") as string;
				return (
					<div className="capitalize">
						<Badge
							variant={
								value === "running"
									? "default"
									: value === "exited" || value === "dead"
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
			accessorKey: "status",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("docker.containers.status")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				return <div className="capitalize">{row.getValue("status")}</div>;
			},
		},
		{
			accessorKey: "image",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("docker.containers.image")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => (
				<div className="lowercase">{row.getValue("image")}</div>
			),
		},
		{
			accessorKey: "ports",
			header: ({ column }) => {
				return (
					<Button
						variant="ghost"
						onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					>
						{t("docker.containers.ports")}
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => {
				const value = row.getValue("ports") as string;
				return (
					<div className="max-w-[16rem] truncate lowercase" title={value}>
						{value}
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
								<span className="sr-only">
									{t("docker.containers.openMenu")}
								</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>
								{t("docker.common.actions")}
							</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => {
									copy(container.containerId);
									toast.success(t("docker.containers.idCopied"));
								}}
							>
								{t("docker.containers.copyId")}
							</DropdownMenuItem>
							<ShowDockerModalLogs
								containerId={container.containerId}
								serverId={container.serverId}
							>
								{t("docker.logs.viewLogs")}
							</ShowDockerModalLogs>
							<ShowContainerConfig
								containerId={container.containerId}
								serverId={container.serverId || ""}
							/>
							<ShowContainerMounts
								containerId={container.containerId}
								serverId={container.serverId || ""}
							/>
							<ShowContainerNetworks
								containerId={container.containerId}
								serverId={container.serverId || ""}
							/>
							<DockerTerminalModal
								containerId={container.containerId}
								serverId={container.serverId || ""}
							>
								{t("docker.terminal.menuItem")}
							</DockerTerminalModal>
							<FilesExplorerModal
								containerId={container.containerId}
								serverId={container.serverId || undefined}
							>
								{t("docker.files.browseFiles")}
							</FilesExplorerModal>
							<UploadFileModal
								containerId={container.containerId}
								serverId={container.serverId || undefined}
							>
								{t("docker.upload.menuItem")}
							</UploadFileModal>
							<RemoveContainerDialog
								containerId={container.containerId}
								serverId={container.serverId ?? undefined}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
};
