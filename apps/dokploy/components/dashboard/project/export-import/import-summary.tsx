import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RequirementsList } from "./requirements-list";

type PendingService = {
	serviceId: string;
	serviceType: string;
	reason: string;
};

export type ConflictSummary = {
	kind: "domain" | "port" | "projectName" | "network";
	value: string;
	options: ("rename" | "skip" | "keep")[];
};

export type ConflictChoice = {
	action: "rename" | "skip" | "keep";
	value?: string;
};

type ValidationCheck = { check: string; ok: boolean; detail?: string };

type WarningSummary = {
	code: string;
	severity: "info" | "warning" | "blocking";
	message: string;
	affected?: { serviceName: string }[];
};

type PlanSummary = {
	counts: Partial<Record<string, number>>;
	domains: number;
	dumps: number;
};

const CONFLICT_LABELS: Record<ConflictSummary["kind"], string> = {
	domain: "Domain",
	port: "Published port",
	projectName: "Project name",
	network: "Network",
};

const OPTION_LABELS: Record<
	ConflictSummary["kind"],
	Partial<Record<ConflictChoice["action"], string>>
> = {
	domain: { rename: "Use another host", skip: "Import disabled" },
	port: {
		rename: "Publish on another port",
		skip: "Don't publish",
		keep: "Publish anyway",
	},
	projectName: { rename: "Import under another name" },
	network: {
		keep: "Attach to the existing network",
		rename: "Create with another name",
		skip: "Don't attach",
	},
};

export const conflictKey = (conflict: ConflictSummary) =>
	`${conflict.kind}:${conflict.value}`;

const ConflictRow = ({
	conflict,
	choice,
	onChange,
}: {
	conflict: ConflictSummary;
	choice: ConflictChoice;
	onChange: (choice: ConflictChoice) => void;
}) => (
	<div className="grid gap-2 rounded-md border p-2 text-xs sm:grid-cols-[minmax(0,1fr)_200px_180px] sm:items-center">
		<div className="flex items-start gap-2">
			<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
			<span>
				<span className="text-muted-foreground">
					{CONFLICT_LABELS[conflict.kind]}{" "}
				</span>
				<span className="font-mono">{conflict.value}</span>
				<span className="text-muted-foreground"> already exists</span>
			</span>
		</div>
		<Select
			value={choice.action}
			onValueChange={(action) =>
				onChange({
					action: action as ConflictChoice["action"],
					value: action === "rename" ? choice.value : undefined,
				})
			}
		>
			<SelectTrigger className="h-8 text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{conflict.options.map((option) => (
					<SelectItem key={option} value={option}>
						{OPTION_LABELS[conflict.kind][option] ?? option}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
		{choice.action === "rename" ? (
			<Input
				className="h-8 text-xs"
				value={choice.value ?? ""}
				placeholder={conflict.kind === "port" ? "e.g. 8081" : "New value"}
				onChange={(e) => onChange({ action: "rename", value: e.target.value })}
			/>
		) : (
			<span />
		)}
	</div>
);

interface ImportSummaryProps {
	summary?: PlanSummary;
	pendingServices?: PendingService[];
	warnings?: WarningSummary[];
	conflicts?: ConflictSummary[];
	conflictChoices: Record<string, ConflictChoice>;
	onConflictChange: (key: string, choice: ConflictChoice) => void;
	validation?: ValidationCheck[];
	isValidating: boolean;
	isLoading: boolean;
}

export const ImportSummary = ({
	summary,
	pendingServices,
	warnings,
	conflicts,
	conflictChoices,
	onConflictChange,
	validation,
	isValidating,
	isLoading,
}: ImportSummaryProps) => {
	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Building plan...</p>;
	}

	const totalResources = summary
		? Object.values(summary.counts).reduce(
				(sum: number, count) => sum + (count ?? 0),
				0,
			)
		: 0;
	const failing = (validation ?? []).filter((check) => !check.ok);

	return (
		<div className="space-y-4">
			{summary && (
				<div className="text-sm space-y-1">
					<p className="font-medium">This import will create</p>
					<p className="text-muted-foreground">
						{totalResources} resource{totalResources === 1 ? "" : "s"},{" "}
						{summary.domains} domain{summary.domains === 1 ? "" : "s"}
						{summary.dumps > 0
							? `, ${summary.dumps} database dump${summary.dumps === 1 ? "" : "s"} to restore`
							: ""}
					</p>
				</div>
			)}

			{conflicts && conflicts.length > 0 && (
				<div className="space-y-1">
					<p className="text-sm font-medium">Conflicts ({conflicts.length})</p>
					<div className="space-y-1 max-h-[200px] overflow-y-auto">
						{conflicts.map((conflict) => {
							const key = conflictKey(conflict);
							return (
								<ConflictRow
									key={key}
									conflict={conflict}
									choice={
										conflictChoices[key] ?? {
											action: conflict.options[0] ?? "skip",
										}
									}
									onChange={(choice) => onConflictChange(key, choice)}
								/>
							);
						})}
					</div>
				</div>
			)}

			<div className="space-y-1">
				<p className="text-sm font-medium flex items-center gap-2">
					Destination checks
					{isValidating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
				</p>
				{!isValidating && validation && validation.length === 0 && (
					<p className="text-xs text-muted-foreground">Nothing to check.</p>
				)}
				{validation && validation.length > 0 && (
					<div className="space-y-1 max-h-[160px] overflow-y-auto">
						{validation.map((check) => (
							<div key={check.check} className="flex items-start gap-2 text-xs">
								{check.ok ? (
									<CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
								) : (
									<XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
								)}
								<span className="font-mono">{check.check}</span>
								{check.detail && (
									<span className="text-muted-foreground">{check.detail}</span>
								)}
							</div>
						))}
					</div>
				)}
				{failing.length > 0 && (
					<p className="text-xs text-destructive">
						Fix the failing checks (or change the resolutions above) before
						starting the import.
					</p>
				)}
			</div>

			{warnings && warnings.length > 0 && (
				<RequirementsList warnings={warnings} />
			)}

			{pendingServices && pendingServices.length > 0 && (
				<AlertBlock type="warning">
					<p className="font-medium">
						{pendingServices.length} service
						{pendingServices.length === 1 ? "" : "s"} will not deploy until you
						fix a missing dependency
					</p>
					{pendingServices.map((service) => (
						<p key={service.serviceId} className="text-xs">
							{service.serviceType}: {service.reason}
						</p>
					))}
				</AlertBlock>
			)}
		</div>
	);
};
