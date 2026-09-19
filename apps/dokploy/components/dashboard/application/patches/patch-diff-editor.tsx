import { SplitSquareVertical } from "lucide-react";
import { CodeEditor } from "@/components/shared/code-editor";
import { buildDiffHunks, type DiffHunk } from "@/lib/patch-diff";
import { cn } from "@/lib/utils";

type PatchType = "create" | "update" | "delete";
export type PatchViewMode = "editor" | "diff";
type DiffViewMode = "unified" | "split";

interface Props {
	filePath: string;
	originalContent: string;
	value: string;
	onChange: (value: string) => void;
	patchType: PatchType;
	mode: PatchViewMode;
	readOnly?: boolean;
	className?: string;
}

const inferLanguage = (filePath: string) => {
	if (filePath.endsWith(".json")) return "json" as const;
	if (filePath.endsWith(".css")) return "css" as const;
	if (filePath.endsWith(".properties")) return "properties" as const;
	if (
		filePath.endsWith(".sh") ||
		filePath.endsWith(".bash") ||
		filePath.endsWith(".zsh")
	) {
		return "shell" as const;
	}
	return "yaml" as const;
};

const renderCodeLines = (content: string, className?: string) => {
	const lines = content.split("\n");
	return (
		<div className={cn("font-mono text-xs leading-6", className)}>
			{lines.map((line, index) => (
				<div
					key={`${index + 1}-${line}`}
					className="grid grid-cols-[48px_1fr] border-b border-border/50"
				>
					<span className="px-3 py-0.5 text-right text-muted-foreground select-none">
						{index + 1}
					</span>
					<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words">
						{line || " "}
					</pre>
				</div>
			))}
		</div>
	);
};

const renderUnifiedDiff = (hunks: DiffHunk[]) => {
	let originalLine = 1;
	let currentLine = 1;

	return (
		<div className="font-mono text-xs leading-6">
			{hunks.flatMap((hunk, hunkIndex) => {
				if (hunk.type === "equal") {
					return hunk.currentLines.map((line, lineIndex) => {
						const row = (
							<div
								key={`equal-${hunkIndex}-${lineIndex}`}
								className="grid grid-cols-[48px_48px_1fr] border-b border-border/40"
							>
								<span className="px-2 py-0.5 text-right text-muted-foreground select-none">
									{originalLine++}
								</span>
								<span className="px-2 py-0.5 text-right text-muted-foreground select-none">
									{currentLine++}
								</span>
								<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words">
									{line || " "}
								</pre>
							</div>
						);
						return row;
					});
				}

				if (hunk.type === "delete") {
					return hunk.originalLines.map((line, lineIndex) => (
						<div
							key={`delete-${hunkIndex}-${lineIndex}`}
							className="grid grid-cols-[48px_48px_1fr] border-b border-red-200 bg-red-50/70 text-red-900 dark:border-red-950 dark:bg-red-950/30 dark:text-red-100"
						>
							<span className="px-2 py-0.5 text-right text-red-700/80 select-none dark:text-red-200/80">
								{originalLine++}
							</span>
							<span className="px-2 py-0.5 text-right text-red-700/80 select-none dark:text-red-200/80">
								-
							</span>
							<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words line-through">
								- {line || " "}
							</pre>
						</div>
					));
				}

				if (hunk.type === "insert") {
					return hunk.currentLines.map((line, lineIndex) => (
						<div
							key={`insert-${hunkIndex}-${lineIndex}`}
							className="grid grid-cols-[48px_48px_1fr] border-b border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
						>
							<span className="px-2 py-0.5 text-right text-emerald-700/80 select-none dark:text-emerald-200/80">
								+
							</span>
							<span className="px-2 py-0.5 text-right text-emerald-700/80 select-none dark:text-emerald-200/80">
								{currentLine++}
							</span>
							<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words">
								+ {line || " "}
							</pre>
						</div>
					));
				}

				const removedRows = hunk.originalLines.map((line, lineIndex) => (
					<div
						key={`replace-old-${hunkIndex}-${lineIndex}`}
						className="grid grid-cols-[48px_48px_1fr] border-b border-red-200 bg-red-50/70 text-red-900 dark:border-red-950 dark:bg-red-950/30 dark:text-red-100"
					>
						<span className="px-2 py-0.5 text-right text-red-700/80 select-none dark:text-red-200/80">
							{originalLine++}
						</span>
						<span className="px-2 py-0.5 text-right text-red-700/80 select-none dark:text-red-200/80">
							-
						</span>
						<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words line-through">
							- {line || " "}
						</pre>
					</div>
				));
				const addedRows = hunk.currentLines.map((line, lineIndex) => (
					<div
						key={`replace-new-${hunkIndex}-${lineIndex}`}
						className="grid grid-cols-[48px_48px_1fr] border-b border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
					>
						<span className="px-2 py-0.5 text-right text-amber-700/80 select-none dark:text-amber-200/80">
							+
						</span>
						<span className="px-2 py-0.5 text-right text-amber-700/80 select-none dark:text-amber-200/80">
							{currentLine++}
						</span>
						<pre className="overflow-x-auto px-3 py-0.5 whitespace-pre-wrap break-words">
							+ {line || " "}
						</pre>
					</div>
				));

				return [...removedRows, ...addedRows];
			})}
		</div>
	);
};

export const PatchDiffEditor = ({
	filePath,
	originalContent,
	value,
	onChange,
	patchType,
	mode,
	readOnly = false,
	className,
}: Props) => {
	const diffHunks = buildDiffHunks(originalContent, value);
	const language = inferLanguage(filePath);
	const diffViewMode: DiffViewMode =
		patchType === "create" ? "unified" : "split";
	const contentLabel =
		patchType === "create"
			? "New file content"
			: patchType === "delete"
				? "Content scheduled for deletion"
				: "Patched content";

	if (mode === "editor") {
		if (patchType === "delete") {
			return (
				<div className={cn("h-full overflow-auto bg-background", className)}>
					{renderCodeLines(originalContent)}
				</div>
			);
		}

		return (
			<CodeEditor
				value={value}
				onChange={(nextValue) => onChange(nextValue || "")}
				className={cn("h-full w-full", className)}
				wrapperClassName="h-full"
				language={language}
				lineWrapping
				disabled={readOnly}
			/>
		);
	}

	return (
		<div
			className={cn("flex h-full min-h-0 flex-col bg-background", className)}
		>
			{patchType === "delete" ? (
				<div className="min-h-0 flex-1 overflow-auto">
					{renderCodeLines(originalContent)}
				</div>
			) : diffViewMode === "split" ? (
				<div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
					<div className="min-h-0 border-b md:border-b-0 md:border-r">
						<div className="flex items-center gap-2 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							<SplitSquareVertical className="h-3.5 w-3.5" />
							Original
						</div>
						<div className="h-full overflow-auto">
							{renderCodeLines(originalContent)}
						</div>
					</div>
					<div className="min-h-0 flex-1">
						<div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{contentLabel}
						</div>
						<CodeEditor
							value={value}
							onChange={(nextValue) => onChange(nextValue || "")}
							className="h-full w-full"
							wrapperClassName="h-full"
							language={language}
							lineWrapping
							disabled={readOnly}
						/>
					</div>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Unified diff
					</div>
					<div className="min-h-0 flex-1 overflow-auto">
						{renderUnifiedDiff(diffHunks)}
					</div>
					<div className="border-t px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{contentLabel}
					</div>
					<div className="min-h-[280px] border-t">
						<CodeEditor
							value={value}
							onChange={(nextValue) => onChange(nextValue || "")}
							className="h-full w-full"
							wrapperClassName="h-[280px]"
							language={language}
							lineWrapping
							disabled={readOnly}
						/>
					</div>
				</div>
			)}
		</div>
	);
};
