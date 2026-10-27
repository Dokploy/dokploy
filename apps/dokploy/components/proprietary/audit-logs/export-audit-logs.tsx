"use client";

import type { AuditLog } from "@dokploy/server/db/schema";
import { format } from "date-fns";
import {
	ChevronDown,
	Download,
	FileJson,
	FileSpreadsheet,
	FileText,
	Loader2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type RouterInputs } from "@/utils/api";

export type AuditLogQueryFilters = RouterInputs["auditLog"]["export"];

const EXPORT_FIELDS = [
	"id",
	"createdAt",
	"userId",
	"userEmail",
	"userRole",
	"action",
	"resourceType",
	"resourceId",
	"resourceName",
	"metadata",
] as const satisfies readonly (keyof AuditLog)[];

type ExportField = (typeof EXPORT_FIELDS)[number];

// Spreadsheet apps evaluate cells starting with these characters as formulas.
// Only user-controlled text is guarded so IDs (nanoid can start with "-") stay intact.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const FORMULA_GUARDED_FIELDS = new Set<ExportField>([
	"userEmail",
	"userRole",
	"resourceName",
	"metadata",
]);

const fieldToString = (log: AuditLog, field: ExportField) => {
	if (field === "createdAt") return log.createdAt.toISOString();
	return log[field] ?? "";
};

const toDelimited = (logs: AuditLog[], delimiter: string) => {
	const escapeCell = (field: ExportField, raw: string) => {
		const value =
			FORMULA_GUARDED_FIELDS.has(field) && FORMULA_PREFIX.test(raw)
				? `'${raw}`
				: raw;
		return value.includes(delimiter) || /["\r\n]/.test(value)
			? `"${value.replace(/"/g, '""')}"`
			: value;
	};

	const rows = logs.map((log) =>
		EXPORT_FIELDS.map((field) =>
			escapeCell(field, fieldToString(log, field)),
		).join(delimiter),
	);
	// BOM so Excel opens the file as UTF-8 instead of the system code page.
	return `\uFEFF${[EXPORT_FIELDS.join(delimiter), ...rows].join("\r\n")}`;
};

const parseMetadata = (metadata: string | null) => {
	if (!metadata) return null;
	try {
		return JSON.parse(metadata);
	} catch {
		return metadata;
	}
};

const toJson = (logs: AuditLog[]) =>
	JSON.stringify(
		logs.map((log) => ({
			...Object.fromEntries(EXPORT_FIELDS.map((field) => [field, log[field]])),
			metadata: parseMetadata(log.metadata),
		})),
		null,
		2,
	);

const EXPORT_FORMATS = [
	{
		extension: "csv",
		label: "CSV",
		description: "Excel, Google Sheets, Numbers",
		icon: FileSpreadsheet,
		mimeType: "text/csv;charset=utf-8",
		build: (logs: AuditLog[]) => toDelimited(logs, ","),
	},
	{
		extension: "tsv",
		label: "TSV",
		description: "Tab-separated values",
		icon: FileText,
		mimeType: "text/tab-separated-values;charset=utf-8",
		build: (logs: AuditLog[]) => toDelimited(logs, "\t"),
	},
	{
		extension: "json",
		label: "JSON",
		description: "Full records with parsed metadata",
		icon: FileJson,
		mimeType: "application/json",
		build: toJson,
	},
];

type ExportFormat = (typeof EXPORT_FORMATS)[number];

const downloadFile = (content: string, filename: string, mimeType: string) => {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

interface ExportAuditLogsProps {
	filters: AuditLogQueryFilters;
	total: number;
}

export function ExportAuditLogs({ filters, total }: ExportAuditLogsProps) {
	const utils = api.useUtils();
	const [isExporting, setIsExporting] = React.useState(false);
	const hasFilters = Object.values(filters).some(
		(value) => value !== undefined,
	);

	const handleExport = async (exportFormat: ExportFormat) => {
		setIsExporting(true);
		try {
			const { logs, total: matching } = await utils.auditLog.export.fetch(
				filters,
				{ staleTime: 0, gcTime: 0 },
			);
			downloadFile(
				exportFormat.build(logs),
				`audit-logs-${format(new Date(), "yyyyMMdd-HHmmss")}.${exportFormat.extension}`,
				exportFormat.mimeType,
			);
			if (logs.length < matching) {
				toast.warning(
					`Exported the newest ${logs.length.toLocaleString()} of ${matching.toLocaleString()} entries`,
					{
						description:
							"Narrow the filters or date range to export older entries.",
					},
				);
			} else {
				toast.success(
					`Exported ${logs.length.toLocaleString()} ${logs.length === 1 ? "entry" : "entries"}`,
				);
			}
		} catch (error) {
			toast.error("Failed to export audit logs", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" disabled={isExporting || total === 0}>
					{isExporting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Download className="mr-2 h-4 w-4" />
					)}
					Export <ChevronDown className="ml-2 h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
					<span className="text-sm text-foreground">
						Export {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
					</span>
					<span className="font-normal">
						{hasFilters
							? "Only entries matching your current filters are included."
							: "No filters applied, so all entries are included."}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{EXPORT_FORMATS.map((exportFormat) => (
					<DropdownMenuItem
						key={exportFormat.extension}
						onSelect={() => handleExport(exportFormat)}
						className="items-start gap-2 py-1.5"
					>
						<exportFormat.icon className="mt-0.5 text-muted-foreground" />
						<div className="flex flex-col">
							<span>{exportFormat.label}</span>
							<span className="text-xs text-muted-foreground">
								{exportFormat.description}
							</span>
						</div>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
