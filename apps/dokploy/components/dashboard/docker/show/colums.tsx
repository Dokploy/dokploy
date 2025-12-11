import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/api";
import { ShowContainerConfig } from "../config/show-container-config";
import { ShowDockerModalLogs } from "../logs/show-docker-modal-logs";
import { DockerTerminalModal } from "../terminal/docker-terminal-modal";
import type { Container } from "./show-containers";

type GetColumnsInput = {
	refetch: () => Promise<unknown>;
	removeContainer: (args: { containerId: string }) => Promise<void>;
};

export function getColumns({
	refetch,
	removeContainer,
}: GetColumnsInput): ColumnDef<Container>[] {
	return [
		{
			accessorKey: "name",
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
			accessorKey: "state",
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
						Status
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
						Image
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				);
			},
			cell: ({ row }) => (
				<div className="lowercase">{row.getValue("image")}</div>
			),
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const container = row.original;
				const { data: auth } = api.user.get.useQuery();

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
							<ShowDockerModalLogs
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
							</DockerTerminalModal>
							{(auth?.role === "owner" || auth?.canDeleteServices) && (
								<DialogAction
									title="Delete Container"
									description={
										<div className="space-y-3">
											<p>
												Are you sure you want to delete {row.getValue("name")}{" "}
												container? This action cannot be undone.
											</p>
											{row.getValue("state") === "running" && (
												<AlertBlock type="warning">
													Warning: Container {row.getValue("name")} is currently
													running. Please stop this container first before
													deleting.
												</AlertBlock>
											)}
										</div>
									}
									type="destructive"
									disabled={row.getValue("state") === "running"}
									onClick={async () => {
										try {
											const container = row.original;
											const containerId = container.containerId;
											const containerAppName = container.name;
											if (!containerId) return;
											toast.info(`Removing container ${containerAppName}`);
											await removeContainer({ containerId });
											toast.success("Container removed");
											await refetch();
										} catch (error) {
											console.error(error);
											toast.error("Failed to remove container");
										}
									}}
								>
									<DropdownMenuItem
										className="w-full cursor-pointer space-x-3"
										onSelect={(e) => e.preventDefault()}
									>
										Delete
									</DropdownMenuItem>
								</DialogAction>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
}
