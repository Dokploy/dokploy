import type {
	Conflict,
	ConflictKind,
	ConflictOption,
	ConflictResolution,
	Target,
} from "./types";
import { conflictKey } from "./types";

export const CONFLICT_OPTIONS: Record<ConflictKind, ConflictOption[]> = {
	domain: ["rename", "skip"],
	port: ["rename", "skip", "keep"],
	projectName: ["rename"],
	network: ["keep", "rename", "skip"],
};

const suggestedProjectName = (name: string) => `${name} (imported)`;

const defaultConflictResolution = (conflict: Conflict): ConflictResolution => {
	switch (conflict.kind) {
		case "domain":
		case "port":
			return { action: "skip" };
		case "projectName":
			return {
				action: "rename",
				value: suggestedProjectName(conflict.value),
			};
		case "network":
			return { action: "keep" };
	}
};

const isValidRenameValue = (kind: ConflictKind, value: string | undefined) => {
	if (!value || value.trim().length === 0) return false;
	if (kind !== "port") return true;
	const port = Number(value.trim());
	return Number.isInteger(port) && port >= 1 && port <= 65535;
};

export const resolveConflicts = (
	conflicts: Conflict[],
	choices: Record<string, ConflictResolution> | undefined,
): Record<string, ConflictResolution> => {
	const resolved: Record<string, ConflictResolution> = {};
	for (const conflict of conflicts) {
		const key = conflictKey(conflict);
		const choice = choices?.[key];
		const valid =
			choice &&
			conflict.options.includes(choice.action) &&
			(choice.action !== "rename" ||
				isValidRenameValue(conflict.kind, choice.value));
		resolved[key] = valid ? choice : defaultConflictResolution(conflict);
	}
	return resolved;
};

export const conflictResolutionsOf = (plan: {
	conflicts: Conflict[];
	conflictResolutions?: Record<string, ConflictResolution>;
	target: Target;
}): Record<string, ConflictResolution> =>
	plan.conflictResolutions ?? resolveConflicts(plan.conflicts, undefined);

export const resolvedProjectName = (
	target: Target,
	resolutions: Record<string, ConflictResolution>,
): string | undefined => {
	if (target.kind !== "newProject") return undefined;
	const resolution =
		resolutions[conflictKey({ kind: "projectName", value: target.name })];
	return resolution?.action === "rename" && resolution.value
		? resolution.value.trim()
		: target.name;
};
