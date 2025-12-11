import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import type { TFunction } from "next-i18next";
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

export const createColumns = (
	t: TFunction,
): ColumnDef<Container>[] => [
	{
		accessorKey: "name",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("docker.containers.table.name")}
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
					{t("docker.containers.table.state")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const value = row.getValue("state") as string;
			const translated =
				(value &&
					t(`docker.containers.state.${value.toLowerCase()}`, {
						defaultValue: value,
					})) ||
				value;
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
						{translated}
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
					{t("docker.containers.table.status")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const value = (row.getValue("status") as string) || "";
			const match = value.match(
				/^(Up|Exited|Paused|Restarting|Created|Removing|Dead)(.*)$/i,
			);
			
			if (!match?.[1]) {
				return <div className="capitalize">{value}</div>;
			}

			const statusKey = match[1].toLowerCase();
			const statusTranslated = t(`docker.containers.status.${statusKey}`, {
				defaultValue: match[1],
			});

			// Parse and translate time information (e.g., " 4 hours", " 2 minutes", " 1 day", " (0) 2 days ago")
			const timePart = match[2]?.trim() || "";
			if (!timePart) {
				return <div className="capitalize">{statusTranslated}</div>;
			}

			// Remove parentheses content (e.g., "(0)") if present
			const cleanedTimePart = timePart.replace(/\([^)]*\)\s*/g, "").trim();

			// Match time patterns: "4 hours", "2 minutes", "1 day", "2 days ago", etc.
			const timeMatch = cleanedTimePart.match(
				/^(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months)(\s+ago)?$/i,
			);

			if (timeMatch && timeMatch[2]) {
				const amount = timeMatch[1];
				const unit = timeMatch[2].toLowerCase();
				const isAgo = timeMatch[3]?.trim() === "ago";

				// Map English units to translation keys
				const unitMap: Record<string, string> = {
					second: "docker.containers.uptime.second",
					seconds: "docker.containers.uptime.seconds",
					minute: "docker.containers.uptime.minute",
					minutes: "docker.containers.uptime.minutes",
					hour: "docker.containers.uptime.hour",
					hours: "docker.containers.uptime.hours",
					day: "docker.containers.uptime.day",
					days: "docker.containers.uptime.days",
					week: "docker.containers.uptime.week",
					weeks: "docker.containers.uptime.weeks",
					month: "docker.containers.uptime.month",
					months: "docker.containers.uptime.months",
				};

				const unitKey = unitMap[unit] || unit;
				const unitTranslated = t(unitKey, { defaultValue: unit });
				const agoTranslated = isAgo
					? ` ${t("docker.containers.uptime.ago", { defaultValue: "ago" })}`
					: "";

				return (
					<div className="capitalize">
						{statusTranslated} {amount} {unitTranslated}
						{agoTranslated}
					</div>
				);
			}

			// If no time match, return status with original time part
			return (
				<div className="capitalize">
					{statusTranslated} {timePart}
				</div>
			);
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
					{t("docker.containers.table.image")}
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
							<span className="sr-only">{t("common.openMenu")}</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>
							{t("docker.containers.actions.label")}
						</DropdownMenuLabel>
						<ShowDockerModalLogs
							containerId={container.containerId}
							serverId={container.serverId}
						>
							{t("docker.containers.actions.viewLogs")}
						</ShowDockerModalLogs>
						<ShowContainerConfig
							containerId={container.containerId}
							serverId={container.serverId || ""}
						/>
						<DockerTerminalModal
							containerId={container.containerId}
							serverId={container.serverId || ""}
						>
							{t("docker.containers.actions.terminal")}
						</DockerTerminalModal>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
