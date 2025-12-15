import type { ColumnDef } from "@tanstack/react-table";
import {
	ArrowUpDown,
	CheckCircle2,
	ExternalLink,
	HelpCircle,
	Loader2,
	MoreHorizontal,
	PenBoxIcon,
	RefreshCw,
	Server,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DnsHelperModal } from "./dns-helper-modal";
import { AddDomain } from "./handle-domain";
import type { ValidationStates } from "./show-domains";

export interface Domain {
	domainId: string;
	host: string;
	https: boolean;
	port: number | null;
	path: string | null;
	serviceName: string | null;
	certificateType: "none" | "letsencrypt" | "custom";
	domainType: "application" | "compose" | "preview" | null;
	createdAt: string;
}

interface ColumnProps {
	id: string;
	type: "application" | "compose";
	validationStates: ValidationStates;
	handleValidateDomain: (host: string) => void;
	handleDeleteDomain: (domainId: string) => void;
	isRemoving: boolean;
	serverIp?: string;
}

export const createColumns = ({
	id,
	type,
	validationStates,
	handleValidateDomain,
	handleDeleteDomain,
	isRemoving,
	serverIp,
}: ColumnProps): ColumnDef<Domain>[] => [
	{
		accessorKey: "host",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Host
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const domain = row.original;
			return (
				<Link
					className="flex items-center gap-2 text-sm font-medium hover:underline"
					target="_blank"
					href={`${domain.https ? "https" : "http"}://${domain.host}${domain.path || "/"}`}
				>
					<span className="max-w-[200px] truncate">{domain.host}</span>
					<ExternalLink className="size-3.5 min-w-3.5" />
				</Link>
			);
		},
	},
	{
		accessorKey: "serviceName",
		header: "Service",
		cell: ({ row }) => {
			const serviceName = row.getValue("serviceName") as string | null;
			if (!serviceName) return <span className="text-muted-foreground">-</span>;
			return (
				<Badge variant="outline" className="w-fit">
					<Server className="size-3 mr-1" />
					{serviceName}
				</Badge>
			);
		},
	},
	{
		accessorKey: "path",
		header: "Path",
		cell: ({ row }) => {
			const path = row.getValue("path") as string | null;
			return <span className="text-sm">{path || "/"}</span>;
		},
	},
	{
		accessorKey: "port",
		header: "Port",
		cell: ({ row }) => {
			const port = row.getValue("port") as number | null;
			return <span className="text-sm">{port != null ? port : "-"}</span>;
		},
	},
	{
		accessorKey: "https",
		header: "Protocol",
		cell: ({ row }) => {
			const https = row.getValue("https") as boolean;
			return (
				<Badge variant={https ? "outline" : "secondary"}>
					{https ? "HTTPS" : "HTTP"}
				</Badge>
			);
		},
	},
	{
		accessorKey: "certificateType",
		header: "Certificate",
		cell: ({ row }) => {
			const certType = row.getValue("certificateType") as string;
			return (
				<Badge variant="outline" className="capitalize">
					{certType}
				</Badge>
			);
		},
	},
	{
		id: "dnsStatus",
		header: "DNS Status",
		cell: ({ row }) => {
			const domain = row.original;
			const validationState = validationStates[domain.host];

			return (
				<Badge
					variant="outline"
					className={
						validationState?.isValid
							? "bg-green-500/10 text-green-500 cursor-pointer"
							: validationState?.error
								? "bg-red-500/10 text-red-500 cursor-pointer"
								: "bg-yellow-500/10 text-yellow-500 cursor-pointer"
					}
					onClick={() => handleValidateDomain(domain.host)}
				>
					{validationState?.isLoading ? (
						<>
							<Loader2 className="size-3 mr-1 animate-spin" />
							Checking...
						</>
					) : validationState?.isValid ? (
						<>
							<CheckCircle2 className="size-3 mr-1" />
							{validationState.message && validationState.cdnProvider
								? `Behind ${validationState.cdnProvider}`
								: "Valid"}
						</>
					) : validationState?.error ? (
						<>
							<XCircle className="size-3 mr-1" />
							Invalid
						</>
					) : (
						<>
							<RefreshCw className="size-3 mr-1" />
							Validate
						</>
					)}
				</Badge>
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const domain = row.original;

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
						{!domain.host.includes("traefik.me") && (
							<DnsHelperModal
								domain={{
									host: domain.host,
									https: domain.https,
									path: domain.path || undefined,
								}}
								serverIp={serverIp}
							>
								<Button
									variant="ghost"
									className="w-full justify-start font-normal h-9 px-2"
								>
									<HelpCircle className="size-4 mr-2" />
									DNS Helper
								</Button>
							</DnsHelperModal>
						)}
						<AddDomain id={id} type={type} domainId={domain.domainId}>
							<Button
								variant="ghost"
								className="w-full justify-start font-normal h-9 px-2"
							>
								<PenBoxIcon className="size-4 mr-2" />
								Edit
							</Button>
						</AddDomain>
						<DialogAction
							title="Delete Domain"
							description="Are you sure you want to delete this domain?"
							type="destructive"
							onClick={() => handleDeleteDomain(domain.domainId)}
						>
							<Button
								variant="ghost"
								className="w-full justify-start font-normal h-9 px-2 text-red-500 hover:text-red-500"
								disabled={isRemoving}
							>
								<Trash2 className="size-4 mr-2" />
								Delete
							</Button>
						</DialogAction>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
