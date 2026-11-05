import micromatch from "micromatch";
import { parse } from "yaml";
import type {
	WorkflowDispatchInput,
	WorkflowJobSummary,
	WorkflowTriggerSummary,
} from "../../db/schema/workflow";

export const SUPPORTED_EVENTS = [
	"push",
	"pull_request",
	"workflow_dispatch",
] as const;

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

type EventFilter = {
	branches?: string[];
	"branches-ignore"?: string[];
	tags?: string[];
	"tags-ignore"?: string[];
	paths?: string[];
	"paths-ignore"?: string[];
	types?: string[];
	inputs?: Record<string, unknown>;
};

export type WorkflowTriggers = Partial<Record<SupportedEvent, EventFilter>>;

export type ParsedWorkflow = {
	name: string;
	triggers: WorkflowTriggers;
	triggerSummary: WorkflowTriggerSummary[];
	jobs: WorkflowJobSummary[];
	dispatchInputs: WorkflowDispatchInput[];
};

const toStringArray = (value: unknown): string[] | undefined => {
	if (value === undefined || value === null) return undefined;
	if (Array.isArray(value)) return value.map((v) => String(v));
	return [String(value)];
};

const normalizeFilter = (value: unknown): EventFilter => {
	if (!value || typeof value !== "object") return {};
	const raw = value as Record<string, unknown>;
	const filter: EventFilter = {};
	for (const key of [
		"branches",
		"branches-ignore",
		"tags",
		"tags-ignore",
		"paths",
		"paths-ignore",
		"types",
	] as const) {
		const list = toStringArray(raw[key]);
		if (list) filter[key] = list;
	}
	if (raw.inputs && typeof raw.inputs === "object") {
		filter.inputs = raw.inputs as Record<string, unknown>;
	}
	return filter;
};

const normalizeOn = (on: unknown): WorkflowTriggers => {
	const triggers: WorkflowTriggers = {};
	const isSupported = (event: string): event is SupportedEvent =>
		(SUPPORTED_EVENTS as readonly string[]).includes(event);

	if (typeof on === "string") {
		if (isSupported(on)) triggers[on] = {};
		return triggers;
	}
	if (Array.isArray(on)) {
		for (const event of on) {
			if (typeof event === "string" && isSupported(event)) triggers[event] = {};
		}
		return triggers;
	}
	if (on && typeof on === "object") {
		for (const [event, value] of Object.entries(on)) {
			if (isSupported(event)) triggers[event] = normalizeFilter(value);
		}
	}
	return triggers;
};

const parseRunsOn = (value: unknown): string[] => {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.map((v) => String(v));
	if (value && typeof value === "object") {
		const labels = (value as { labels?: unknown }).labels;
		const group = (value as { group?: unknown }).group;
		return [
			...(toStringArray(labels) ?? []),
			...(typeof group === "string" ? [group] : []),
		];
	}
	return [];
};

export const parseWorkflow = (
	content: string,
	fallbackName: string,
): ParsedWorkflow => {
	const doc = parse(content) as Record<string, unknown> | null;
	if (!doc || typeof doc !== "object") {
		throw new Error("The workflow file is empty or not a YAML mapping");
	}

	// YAML 1.1 parsers read a bare `on:` key as boolean true.
	const on = doc.on ?? (doc as Record<string, unknown>).true;
	if (on === undefined) {
		throw new Error("The workflow has no `on` section");
	}

	const rawJobs = doc.jobs;
	if (!rawJobs || typeof rawJobs !== "object" || Array.isArray(rawJobs)) {
		throw new Error("The workflow has no `jobs` section");
	}

	const triggers = normalizeOn(on);

	const triggerSummary: WorkflowTriggerSummary[] = Object.entries(triggers).map(
		([event, filter]) => ({
			event,
			...(filter?.branches ? { branches: filter.branches } : {}),
			...(filter?.tags ? { tags: filter.tags } : {}),
		}),
	);

	const jobs: WorkflowJobSummary[] = Object.entries(
		rawJobs as Record<string, unknown>,
	).map(([id, job]) => {
		const value = (job ?? {}) as Record<string, unknown>;
		return {
			id,
			name: typeof value.name === "string" ? value.name : id,
			runsOn: parseRunsOn(value["runs-on"]),
		};
	});

	const dispatchInputs: WorkflowDispatchInput[] = Object.entries(
		triggers.workflow_dispatch?.inputs ?? {},
	).map(([name, raw]) => {
		const input = (raw ?? {}) as Record<string, unknown>;
		return {
			name,
			...(typeof input.description === "string"
				? { description: input.description }
				: {}),
			...(typeof input.required === "boolean"
				? { required: input.required }
				: {}),
			...(input.default !== undefined
				? { default: String(input.default) }
				: {}),
			...(typeof input.type === "string" ? { type: input.type } : {}),
			...(Array.isArray(input.options)
				? { options: input.options.map((o) => String(o)) }
				: {}),
		};
	});

	return {
		name: typeof doc.name === "string" && doc.name ? doc.name : fallbackName,
		triggers,
		triggerSummary,
		jobs,
		dispatchInputs,
	};
};

// GitHub evaluates filter patterns in order and lets a later `!pattern`
// exclude what an earlier one included, so the last match wins.
export const matchesPatterns = (value: string, patterns: string[]) => {
	let matched = false;
	for (const pattern of patterns) {
		if (pattern.startsWith("!")) {
			if (micromatch.isMatch(value, pattern.slice(1), { dot: true })) {
				matched = false;
			}
		} else if (micromatch.isMatch(value, pattern, { dot: true })) {
			matched = true;
		}
	}
	return matched;
};

const matchesIncludeIgnore = (
	value: string,
	include?: string[],
	ignore?: string[],
) => {
	if (include) return matchesPatterns(value, include);
	if (ignore) return !matchesPatterns(value, ignore);
	return true;
};

const matchesPaths = (filter: EventFilter, changedFiles?: string[]) => {
	if (!filter.paths && !filter["paths-ignore"]) return true;
	// Without a file list (e.g. a new branch) GitHub runs the workflow.
	if (!changedFiles) return true;
	if (filter.paths) {
		return changedFiles.some((file) => matchesPatterns(file, filter.paths!));
	}
	return changedFiles.some(
		(file) => !matchesPatterns(file, filter["paths-ignore"]!),
	);
};

const DEFAULT_PULL_REQUEST_TYPES = ["opened", "synchronize", "reopened"];

export type WorkflowEvent =
	| {
			name: "push";
			branch?: string;
			tag?: string;
			changedFiles?: string[];
	  }
	| {
			name: "pull_request";
			action: string;
			baseBranch: string;
			changedFiles?: string[];
	  };

export const workflowMatchesEvent = (
	triggers: WorkflowTriggers,
	event: WorkflowEvent,
) => {
	if (event.name === "push") {
		const filter = triggers.push;
		if (!filter) return false;

		const hasBranchFilter = !!(filter.branches || filter["branches-ignore"]);
		const hasTagFilter = !!(filter.tags || filter["tags-ignore"]);

		if (event.tag !== undefined) {
			// A push filtered only by branches never runs for tags.
			if (hasBranchFilter && !hasTagFilter) return false;
			if (!matchesIncludeIgnore(event.tag, filter.tags, filter["tags-ignore"]))
				return false;
			return true;
		}

		if (event.branch === undefined) return false;
		if (hasTagFilter && !hasBranchFilter) return false;
		if (
			!matchesIncludeIgnore(
				event.branch,
				filter.branches,
				filter["branches-ignore"],
			)
		) {
			return false;
		}
		return matchesPaths(filter, event.changedFiles);
	}

	const filter = triggers.pull_request;
	if (!filter) return false;
	const types = filter.types ?? DEFAULT_PULL_REQUEST_TYPES;
	if (!types.includes(event.action)) return false;
	if (
		!matchesIncludeIgnore(
			event.baseBranch,
			filter.branches,
			filter["branches-ignore"],
		)
	) {
		return false;
	}
	return matchesPaths(filter, event.changedFiles);
};
