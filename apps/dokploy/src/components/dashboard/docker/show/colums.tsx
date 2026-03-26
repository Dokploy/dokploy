import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShowContainerConfig } from "../config/show-container-config";
import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
import type { Container } from "./show-containers";

type DockerContainersTranslator = (key: string) => string;

export const useDockerContainerTable = () => {
	const t = useTranslations("dockerContainers");
	const columns = useMemo(() => getColumns(t), [t]);
	const columnLabels = useMemo(
		() => ({
			name: t("column_name"),
			state: t("column_state"),
			status: t("column_status"),
			image: t("column_image"),
			actions: t("column_actions"),
		}),
		[t],
	);
	return { columns, columnLabels };
};

export const getColumns = (
	t: DockerContainersTranslator,
): ColumnDef<Container>[] => [
	{
		accessorKey: "name",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("column_name")}
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
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("column_state")}
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
								: value === "failed"
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
					{t("column_status")}
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
					{t("column_image")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => <div className="lowercase">{row.getValue("image")}</div>,
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
							<span className="sr-only">{t("openMenu")}</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
						<ShowDockerModalLogs
							containerId={container.containerId}
							serverId={container.serverId}
						>
							{t("viewLogs")}
						</ShowDockerModalLogs>
						<ShowContainerConfig
							containerId={container.containerId}
							serverId={container.serverId || ""}
						/>
						<DockerTerminalModal
							containerId={container.containerId}
							serverId={container.serverId || ""}
						>
							{t("terminal")}
						</DockerTerminalModal>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
