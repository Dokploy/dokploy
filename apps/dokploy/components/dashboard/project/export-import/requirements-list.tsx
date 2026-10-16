import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { formatBytes } from "@/components/dashboard/database/backups/restore-backup";

type RequirementSummary = {
	kind: string;
	usedBy: { serviceName: string }[];
};

type WarningSummary = {
	code: string;
	severity: "info" | "warning" | "blocking";
	message: string;
	affected?: { serviceName: string }[];
};

const MAX_NAMES_SHOWN = 5;

type WarningGroup = WarningSummary & { names: string[] };

const groupWarnings = (warnings: WarningSummary[]): WarningGroup[] => {
	const groups = new Map<string, WarningGroup>();
	for (const warning of warnings) {
		const key = `${warning.code}\n${warning.message}`;
		const group = groups.get(key) ?? { ...warning, names: [] };
		for (const usedBy of warning.affected ?? []) {
			if (usedBy.serviceName && !group.names.includes(usedBy.serviceName)) {
				group.names.push(usedBy.serviceName);
			}
		}
		groups.set(key, group);
	}
	return Array.from(groups.values());
};

const formatNames = (names: string[]): string =>
	names.length <= MAX_NAMES_SHOWN
		? names.join(", ")
		: `${names.slice(0, MAX_NAMES_SHOWN).join(", ")} and ${names.length - MAX_NAMES_SHOWN} more`;

interface RequirementsListProps {
	inventory?: {
		environments: unknown[];
		totals: Partial<Record<string, number>>;
		estimatedDumpBytes?: number;
		estimatedFilesBytes?: number;
		images?: { name: string; image: string }[];
	};
	requirements?: RequirementSummary[];
	warnings?: WarningSummary[];
	isLoading?: boolean;
}

const severityIcon = (severity: WarningSummary["severity"]) => {
	if (severity === "blocking") {
		return (
			<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
		);
	}
	if (severity === "warning") {
		return (
			<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500 mt-0.5" />
		);
	}
	return <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />;
};

export const RequirementsList = ({
	inventory,
	requirements,
	warnings,
	isLoading = false,
}: RequirementsListProps) => {
	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Loading preview...</p>;
	}

	const totalResources = inventory
		? Object.values(inventory.totals).reduce(
				(sum: number, count) => sum + (count ?? 0),
				0,
			)
		: 0;

	return (
		<div className="space-y-4">
			{inventory && (
				<div className="text-sm">
					<p className="font-medium">Inventory</p>
					<p className="text-muted-foreground">
						{inventory.environments.length} environment
						{inventory.environments.length === 1 ? "" : "s"}, {totalResources}{" "}
						total resources
						{inventory.estimatedDumpBytes || inventory.estimatedFilesBytes
							? ` · about ${formatBytes(inventory.estimatedDumpBytes ?? 0)} of database data and ${formatBytes(inventory.estimatedFilesBytes ?? 0)} of files`
							: ""}
					</p>
					{inventory.images && inventory.images.length > 0 && (
						<p className="text-xs text-muted-foreground">
							Images:{" "}
							{inventory.images
								.map((entry) => `${entry.name} (${entry.image})`)
								.join(", ")}
						</p>
					)}
				</div>
			)}

			{requirements && requirements.length > 0 && (
				<div className="space-y-1">
					<p className="text-sm font-medium">
						External dependencies ({requirements.length})
					</p>
					<div className="space-y-1 max-h-[150px] overflow-y-auto">
						{requirements.map((req, index) => (
							<div key={index} className="flex items-center gap-2 text-xs">
								<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
									{req.kind}
								</span>
								<span className="text-muted-foreground">
									used by {req.usedBy.length} service
									{req.usedBy.length === 1 ? "" : "s"}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{warnings && warnings.length > 0 && (
				<div className="space-y-1">
					<p className="text-sm font-medium">Warnings ({warnings.length})</p>
					<div className="space-y-2 max-h-[150px] overflow-y-auto">
						{groupWarnings(warnings).map((warning, index) => (
							<div key={index} className="flex items-start gap-2 text-xs">
								{severityIcon(warning.severity)}
								<span className="text-muted-foreground">
									{warning.names.length > 0 && (
										<span className="font-medium text-foreground">
											{formatNames(warning.names)}:{" "}
										</span>
									)}
									{warning.message}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{requirements?.length === 0 && warnings?.length === 0 && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<CheckCircle2 className="h-4 w-4" />
					No external dependencies or warnings detected.
				</div>
			)}
		</div>
	);
};
