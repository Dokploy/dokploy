import { quote } from "shell-quote";

export type SandboxFileType = "file" | "directory" | "symlink" | "other";

export interface SandboxFileEntry {
	name: string;
	type: SandboxFileType;
	size: number | null;
	mode: string | null;
	modifiedAt: string | null;
}

export const buildSandboxFindCommand = (path: string) =>
	`find ${quote([path])} -mindepth 1 -maxdepth 1 -printf '%y\\t%s\\t%T@\\t%m\\t%f\\n'`;

export const buildSandboxLsCommand = (path: string) =>
	`ls -1Ap ${quote([path])}`;

const FIND_TYPES: Record<string, SandboxFileType> = {
	f: "file",
	d: "directory",
	l: "symlink",
};

const sortEntries = (a: SandboxFileEntry, b: SandboxFileEntry) => {
	if (a.type !== b.type) {
		if (a.type === "directory") return -1;
		if (b.type === "directory") return 1;
	}
	return a.name.localeCompare(b.name);
};

export const parseSandboxFindOutput = (stdout: string): SandboxFileEntry[] =>
	stdout
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			const [type, size, mtime, mode, ...rest] = line.split("\t");
			const name = rest.join("\t");
			if (!name) return [];
			const seconds = Number.parseFloat(mtime ?? "");
			const bytes = Number.parseInt(size ?? "", 10);
			return [
				{
					name,
					type: FIND_TYPES[type ?? ""] ?? "other",
					size: Number.isInteger(bytes) ? bytes : null,
					mode: mode || null,
					modifiedAt: Number.isFinite(seconds)
						? new Date(Math.floor(seconds * 1000)).toISOString()
						: null,
				},
			];
		})
		.sort(sortEntries);

export const parseSandboxLsOutput = (stdout: string): SandboxFileEntry[] =>
	stdout
		.split("\n")
		.filter(Boolean)
		.map((entry) => ({
			name: entry.endsWith("/") ? entry.slice(0, -1) : entry,
			type: (entry.endsWith("/") ? "directory" : "file") as SandboxFileType,
			size: null,
			mode: null,
			modifiedAt: null,
		}))
		.sort(sortEntries);
