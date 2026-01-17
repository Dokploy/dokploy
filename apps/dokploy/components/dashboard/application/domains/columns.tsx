import type { ColumnDef } from "@tanstack/react-table";
import {
	ArrowUpDown,
	CheckCircle2,
	ExternalLink,
	Loader2,
	PenBoxIcon,
	RefreshCw,
	Trash2,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RouterOutputs } from "@/utils/api";
import type { ValidationStates } from "./show-domains";
import { AddDomain } from "./handle-domain";
import { DnsHelperModal } from "./dns-helper-modal";

export type Domain =
	| RouterOutputs["domain"]["byApplicationId"][0]
	| RouterOutputs["domain"]["byComposeId"][0];

interface ColumnsProps {
	id: string;
	type: "application" | "compose";
	validationStates: ValidationStates;
	handleValidateDomain: (host: string) => Promise<void>;
	handleDeleteDomain: (domainId: string) => Promise<void>;
	isDeleting: boolean;
	serverIp?: string;
}

export const createColumns = ({
	id,
	type,
	validationStates,
	handleValidateDomain,
	handleDeleteDomain,
	isDeleting,
	serverIp,
}: ColumnsProps): ColumnDef<Domain>[] => [
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
				<AddDomain id={id} type={type} domainId={domain.domainId}>
					<Button variant="link" className="p-0 h-auto font-medium">
						<Link
							className="flex items-center gap-2 hover:underline"
							target="_blank"
							href={`${domain.https ? "https" : "http"}://${domain.host}${domain.path}`}
							onClick={(e) => e.stopPropagation()}
						>
							{domain.host}
							<ExternalLink className="size-3" />
						</Link>
					</Button>
				</AddDomain>
			);
		},
	},
	{
		accessorKey: "path",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Path
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const path = row.getValue("path") as string;
			return <div className="font-mono text-sm">{path || "/"}</div>;
		},
	},
	{
		accessorKey: "port",
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
			const port = row.getValue("port") as number;
			return <Badge variant="secondary">{port}</Badge>;
		},
	},
	{
		accessorKey: "https",
		header: "Protocol",
		cell: ({ row }) => {
			const https = row.getValue("https") as boolean;
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant={https ? "outline" : "secondary"}>
								{https ? "HTTPS" : "HTTP"}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p>
								{https ? "Secure HTTPS connection" : "Standard HTTP connection"}
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
	{
		id: "certificate",
		header: "Certificate",
		cell: ({ row }) => {
			const domain = row.original;
			const validationState = validationStates[domain.host];

			return (
				<div className="flex items-center gap-2">
					{domain.certificateType && (
						<Badge variant="outline" className="capitalize">
							{domain.certificateType}
						</Badge>
					)}
					{!domain.host.includes("traefik.me") && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
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
													? `${validationState.cdnProvider}`
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
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									{validationState?.error ? (
										<div className="flex flex-col gap-1">
											<p className="font-medium text-red-500">Error:</p>
											<p>{validationState.error}</p>
										</div>
									) : (
										"Click to validate DNS configuration"
									)}
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</div>
			);
		},
	},
	{
		id: "actions",
		header: "Actions",
		enableHiding: false,
		cell: ({ row }) => {
			const domain = row.original;

			return (
				<div className="flex items-center gap-2">
					{!domain.host.includes("traefik.me") && (
						<DnsHelperModal
							domain={{
								host: domain.host,
								https: domain.https,
								path: domain.path || undefined,
							}}
							serverIp={serverIp}
						/>
					)}
					<AddDomain id={id} type={type} domainId={domain.domainId}>
						<Button
							variant="ghost"
							size="icon"
							className="group hover:bg-blue-500/10 h-8 w-8"
						>
							<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
						</Button>
					</AddDomain>
					<DialogAction
						title="Delete Domain"
						description="Are you sure you want to delete this domain?"
						type="destructive"
						onClick={async () => {
							await handleDeleteDomain(domain.domainId);
						}}
					>
						<Button
							variant="ghost"
							size="icon"
							className="group hover:bg-red-500/10 h-8 w-8"
							isLoading={isDeleting}
						>
							<Trash2 className="size-4 text-primary group-hover:text-red-500" />
						</Button>
					</DialogAction>
				</div>
			);
		},
	},
];
