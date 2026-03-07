import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseDockerTimestamp } from "@/lib/utils";
import { DeleteNetworkDialog } from "../dialogs/delete-network-dialog";
import { NetworkDetailsDialog } from "../dialogs/network-details-dialog";
import type { NetworkData } from "./show-networks";

export const columns: ColumnDef<NetworkData>[] = [
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
		cell: ({ row }) => (
			<div className="font-medium">{row.getValue("name")}</div>
		),
	},
	{
		accessorKey: "id",
		header: "Network ID",
		cell: ({ row }) => {
			const id = row.getValue("id") as string;
			return <div className="font-mono text-xs">{id.substring(0, 12)}...</div>;
		},
	},
	{
		accessorKey: "driver",
		header: "Driver",
		cell: ({ row }) => {
			const driver = row.getValue("driver") as string;
			return (
				<Badge variant="outline" className="capitalize">
					{driver}
				</Badge>
			);
		},
	},
	{
		accessorKey: "scope",
		header: "Scope",
		cell: ({ row }) => {
			const scope = row.getValue("scope") as string;
			return (
				<Badge
					variant={scope === "local" ? "secondary" : "default"}
					className="capitalize"
				>
					{scope}
				</Badge>
			);
		},
	},
	{
		accessorKey: "created",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Created
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const created = row.getValue("created") as string;
			if (!created) return <span className="text-muted-foreground">-</span>;

			return <div className="text-sm">{parseDockerTimestamp(created)}</div>;
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const network = row.original;
			const isSystemNetwork = [
				"bridge",
				"host",
				"none",
				"dokploy-network",
			].includes(network.name);

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
						<DropdownMenuSeparator />
						<NetworkDetailsDialog
							networkId={network.id}
							serverId={network.serverId}
						>
							<DropdownMenuItem onSelect={(e) => e.preventDefault()}>
								<Eye className="h-4 w-4 mr-2" />
								View details
							</DropdownMenuItem>
						</NetworkDetailsDialog>
						{!isSystemNetwork && (
							<>
								<DropdownMenuSeparator />
								<DeleteNetworkDialog network={network}>
									<DropdownMenuItem
										onSelect={(e) => e.preventDefault()}
										className="text-destructive focus:text-destructive"
									>
										<Trash2 className="h-4 w-4 mr-2" />
										Delete network
									</DropdownMenuItem>
								</DeleteNetworkDialog>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
