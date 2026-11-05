import {
	Ban,
	CheckCircle2,
	CircleDashed,
	CircleSlash,
	Loader2,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowRunStatus =
	| "queued"
	| "running"
	| "success"
	| "failure"
	| "cancelled"
	| "skipped";

export const RUN_STATUSES: WorkflowRunStatus[] = [
	"queued",
	"running",
	"success",
	"failure",
	"cancelled",
	"skipped",
];

const STATUS_ICONS = {
	queued: { icon: CircleDashed, className: "text-muted-foreground" },
	running: { icon: Loader2, className: "text-amber-500 animate-spin" },
	success: { icon: CheckCircle2, className: "text-green-500" },
	failure: { icon: XCircle, className: "text-red-500" },
	cancelled: { icon: Ban, className: "text-muted-foreground" },
	skipped: { icon: CircleSlash, className: "text-muted-foreground" },
} as const;

export const RunStatusIcon = ({
	status,
	className,
}: {
	status: WorkflowRunStatus;
	className?: string;
}) => {
	const { icon: Icon, className: color } = STATUS_ICONS[status];
	return (
		<Icon
			className={cn("size-4 shrink-0", color, className)}
			aria-label={status}
		/>
	);
};

export const isActiveStatus = (status: WorkflowRunStatus) =>
	status === "queued" || status === "running";

export const formatDuration = (
	startedAt?: string | null,
	finishedAt?: string | null,
) => {
	if (!startedAt) return "—";
	const end = finishedAt ? Date.parse(finishedAt) : Date.now();
	const seconds = Math.max(0, Math.round((end - Date.parse(startedAt)) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = seconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${rest}s`;
	return `${rest}s`;
};

const EVENT_LABELS: Record<string, string> = {
	push: "Push",
	pull_request: "Pull request",
	workflow_dispatch: "Manual",
};

export const formatEvent = (event: string, action?: string | null) => {
	const label = EVENT_LABELS[event] ?? event;
	return action ? `${label} (${action})` : label;
};

export const formatTrigger = (trigger: {
	event: string;
	branches?: string[];
	tags?: string[];
}) => {
	const label = EVENT_LABELS[trigger.event] ?? trigger.event;
	const filters = [...(trigger.branches ?? []), ...(trigger.tags ?? [])];
	return filters.length > 0 ? `${label}: ${filters.join(", ")}` : label;
};

export const githubRepositoryUrl = (
	githubUrl: string | null | undefined,
	owner: string,
	repository: string,
) =>
	`${(githubUrl || "https://github.com").replace(/\/$/, "")}/${owner}/${repository}`;
