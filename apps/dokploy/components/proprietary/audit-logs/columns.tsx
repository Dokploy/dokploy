"use client";

import type { AuditLog } from "@dokploy/server/db/schema";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
	ArrowUpDown,
	FileJson,
	LogIn,
	LogOut,
	PlusCircle,
	RefreshCw,
	RotateCcw,
	Trash2,
	Upload,
	XCircle,
} from "lucide-react";
import React from "react";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

const ACTION_CONFIG: Record<
	string,
	{ label: string; icon: React.ElementType; className: string }
> = {
	create: {
		label: "Created",
		icon: PlusCircle,
		className:
			"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
	},
	update: {
		label: "Updated",
		icon: RefreshCw,
		className:
			"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	},
	delete: {
		label: "Deleted",
		icon: Trash2,
		className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
	},
	deploy: {
		label: "Deployed",
		icon: Upload,
		className:
			"bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
	},
	cancel: {
		label: "Cancelled",
		icon: XCircle,
		className:
			"bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
	},
	redeploy: {
		label: "Redeployed",
		icon: RotateCcw,
		className:
			"bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
	},
	login: {
		label: "Login",
		icon: LogIn,
		className:
			"bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
	},
	logout: {
		label: "Logout",
		icon: LogOut,
		className:
			"bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
	},
};

const RESOURCE_LABELS: Record<string, string> = {
	project: "Project",
	service: "Service",
	environment: "Environment",
	deployment: "Deployment",
	user: "User",
	customRole: "Custom Role",
	domain: "Domain",
	certificate: "Certificate",
	registry: "Registry",
	server: "Server",
	sshKey: "SSH Key",
	gitProvider: "Git Provider",
	notification: "Notification",
	settings: "Settings",
	session: "Session",
};

function MetadataCell({ metadata }: { metadata: string | null }) {
	if (!metadata)
		return <span className="text-muted-foreground text-sm">—</span>;

	const formatted = React.useMemo(() => {
		try {
			return JSON.stringify(JSON.parse(metadata), null, 2);
		} catch {
			return metadata;
		}
	}, [metadata]);

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
					<FileJson className="h-3.5 w-3.5" />
					View
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Metadata</DialogTitle>
				</DialogHeader>
				<CodeEditor
					value={formatted}
					language="json"
					lineNumbers={false}
					readOnly
					className="min-h-[200px] max-h-[400px] overflow-auto rounded-md"
				/>
			</DialogContent>
		</Dialog>
	);
}

export const columns: ColumnDef<AuditLog>[] = [
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Date
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground whitespace-nowrap">
				{format(new Date(row.getValue("createdAt")), "MMM d, yyyy HH:mm")}
			</span>
		),
	},
	{
		accessorKey: "userEmail",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				User
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => (
			<span className="text-sm">{row.getValue("userEmail")}</span>
		),
	},
	{
		accessorKey: "action",
		header: ({ column }) => (
			<Button
				variant="ghost"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Action
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => {
			const action = row.getValue("action") as string;
			const config = ACTION_CONFIG[action];
			if (!config) {
				return <span className="text-xs text-muted-foreground">{action}</span>;
			}
			const Icon = config.icon;
			return (
				<span
					className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
				>
					<Icon className="size-3" />
					{config.label}
				</span>
			);
		},
	},
	{
		accessorKey: "resourceType",
		header: "Resource",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{RESOURCE_LABELS[row.getValue("resourceType") as string] ??
					row.getValue("resourceType")}
			</span>
		),
	},
	{
		accessorKey: "resourceName",
		header: "Name",
		cell: ({ row }) => (
			<span className="text-sm font-medium">
				{(row.getValue("resourceName") as string) ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "userRole",
		header: "Role",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground capitalize">
				{row.getValue("userRole")}
			</span>
		),
	},
	{
		accessorKey: "metadata",
		header: "Metadata",
		cell: ({ row }) => <MetadataCell metadata={row.getValue("metadata")} />,
	},
];
