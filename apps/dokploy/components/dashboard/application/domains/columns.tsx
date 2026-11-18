import type { ColumnDef } from "@tanstack/react-table";
import {
	AlertTriangle,
	ArrowUpDown,
	CheckCircle2,
	ExternalLink,
	Loader2,
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
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RouterOutputs } from "@/utils/api";
import { DnsHelperModal } from "./dns-helper-modal";
import { AddDomain } from "./handle-domain";
import type { ValidationStates } from "./show-domains";

export type Domain =
	| RouterOutputs["domain"]["byApplicationId"][0]
	| RouterOutputs["domain"]["byComposeId"][0];

interface ColumnsProps {
	id: string;
	type: "application" | "compose";
	validationStates: ValidationStates;
	handleValidateDomain: (host: string) => Promise<void>;
	handleDeleteDomain: (domainId: string) => Promise<void>;
	handleToggleEnable: (domainId: string) => Promise<void>;
	isDeleting: boolean;
	isToggling: boolean;
	serverIp?: string;
	canCreateDomain: boolean;
	canDeleteDomain: boolean;
	t: (key: string, options?: Record<string, unknown>) => string;
}

export const createColumns = ({
	id,
	type,
	validationStates,
	handleValidateDomain,
	handleDeleteDomain,
	handleToggleEnable,
	isDeleting,
	isToggling,
	serverIp,
	canCreateDomain,
	canDeleteDomain,
	t,
}: ColumnsProps): ColumnDef<Domain>[] => [
	...(type === "compose"
		? [
				{
					accessorKey: "serviceName",
					header: t("application.domains.service"),
					cell: ({ row }: { row: { getValue: (key: string) => unknown } }) => {
						const serviceName = row.getValue("serviceName") as string | null;
						if (!serviceName) return null;
						return (
							<Badge variant="outline">
								<Server className="size-3 mr-1" />
								{serviceName}
							</Badge>
						);
					},
				} satisfies ColumnDef<Domain>,
			]
		: []),
	{
		accessorKey: "host",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("application.domains.host")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const domain = row.original;
			return (
				<Link
					className="flex items-center gap-2 font-medium hover:underline"
					target="_blank"
					href={`${domain.https ? "https" : "http"}://${domain.host}${domain.path}`}
				>
					{domain.host}
					<ExternalLink className="size-3" />
				</Link>
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
					{t("application.domains.path")}
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
					{t("application.domains.port")}
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
		accessorKey: "customEntrypoint",
		header: t("application.domains.entrypoint"),
		cell: ({ row }) => {
			const entrypoint = row.getValue("customEntrypoint") as string | null;
			if (!entrypoint) return <span className="text-muted-foreground">-</span>;
			return <div className="font-mono text-sm">{entrypoint}</div>;
		},
	},
	{
		accessorKey: "https",
		header: t("application.domains.protocol"),
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
		id: "certificate",
		header: t("application.domains.certificate"),
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
					{!domain.host.includes("sslip.io") && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge
										variant="outline"
										className={
											validationState?.ipMismatch
												? "bg-yellow-500/10 text-yellow-500 cursor-pointer"
												: validationState?.isValid
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
												{t("application.domains.checking")}
											</>
										) : validationState?.ipMismatch ? (
											<>
												<AlertTriangle className="size-3 mr-1" />
												{t("application.domains.ipMismatch")}
											</>
										) : validationState?.isValid ? (
											<>
												<CheckCircle2 className="size-3 mr-1" />
												{validationState.message && validationState.cdnProvider
													? `${validationState.cdnProvider}`
													: t("application.domains.valid")}
											</>
										) : validationState?.error ? (
											<>
												<XCircle className="size-3 mr-1" />
												{t("application.domains.invalid")}
											</>
										) : (
											<>
												<RefreshCw className="size-3 mr-1" />
												{t("application.domains.validate")}
											</>
										)}
									</Badge>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									{validationState?.isValid && validationState?.message ? (
										<p>{validationState.message}</p>
									) : validationState?.error ? (
										<div className="flex flex-col gap-1">
											<p className="font-medium text-red-500">
												{t("application.domains.errorLabel")}
											</p>
											<p>{validationState.error}</p>
										</div>
									) : (
										t("application.domains.validateTooltip")
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
		accessorKey: "createdAt",
		header: ({ column }) => {
			return (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					{t("application.domains.created")}
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			);
		},
		cell: ({ row }) => {
			const createdAt = row.getValue("createdAt") as string;
			return (
				<div className="text-sm text-muted-foreground">
					{new Date(createdAt).toLocaleDateString()}
				</div>
			);
		},
	},
	{
		id: "status",
		header: t("application.domains.status"),
		cell: ({ row }) => {
			const domain = row.original;
			if (!canCreateDomain) {
				return (
					<Badge variant={domain.enabled ? "outline" : "secondary"}>
						{domain.enabled
							? t("application.domains.enabled")
							: t("application.domains.disabled")}
					</Badge>
				);
			}
			return (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="flex items-center">
								<Switch
									checked={domain.enabled}
									onCheckedChange={() => handleToggleEnable(domain.domainId)}
									disabled={isToggling}
								/>
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<p>
								{domain.enabled
									? t("application.domains.enabledTooltip")
									: t("application.domains.disabledTooltip")}
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
	{
		id: "actions",
		header: t("application.domains.actions"),
		enableHiding: false,
		cell: ({ row }) => {
			const domain = row.original;

			return (
				<div className="flex items-center gap-2">
					{!domain.host.includes("sslip.io") && (
						<DnsHelperModal
							domain={{
								host: domain.host,
								https: domain.https,
								path: domain.path || undefined,
							}}
							serverIp={serverIp}
						/>
					)}
					{canCreateDomain && (
						<AddDomain id={id} type={type} domainId={domain.domainId}>
							<Button
								variant="ghost"
								size="icon"
								className="group hover:bg-blue-500/10 h-8 w-8"
							>
								<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
							</Button>
						</AddDomain>
					)}
					{canDeleteDomain && (
						<DialogAction
							title={t("application.domains.deleteDomain")}
							description={t("application.domains.deleteDomainConfirm")}
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
					)}
				</div>
			);
		},
	},
];
