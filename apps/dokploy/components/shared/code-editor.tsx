import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { search, searchKeymap } from "@codemirror/search";
import { EditorView, GutterMarker, gutter, keymap } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

// Docker Compose completion options
const dockerComposeServices = [
	{ label: "services", type: "keyword", info: "Define services" },
	{ label: "version", type: "keyword", info: "Specify compose file version" },
	{ label: "volumes", type: "keyword", info: "Define volumes" },
	{ label: "networks", type: "keyword", info: "Define networks" },
	{ label: "configs", type: "keyword", info: "Define configuration files" },
	{ label: "secrets", type: "keyword", info: "Define secrets" },
].map((opt) => ({
	...opt,
	apply: (
		view: EditorView,
		completion: Completion,
		from: number,
		to: number,
	) => {
		const insert = `${completion.label}:`;
		view.dispatch({
			changes: {
				from,
				to,
				insert,
			},
			selection: { anchor: from + insert.length },
		});
	},
}));

const dockerComposeServiceOptions = [
	{
		label: "image",
		type: "keyword",
		info: "Specify the image to start the container from",
	},
	{ label: "build", type: "keyword", info: "Build configuration" },
	{ label: "command", type: "keyword", info: "Override the default command" },
	{ label: "container_name", type: "keyword", info: "Custom container name" },
	{
		label: "depends_on",
		type: "keyword",
		info: "Express dependency between services",
	},
	{ label: "environment", type: "keyword", info: "Add environment variables" },
	{
		label: "env_file",
		type: "keyword",
		info: "Add environment variables from a file",
	},
	{
		label: "expose",
		type: "keyword",
		info: "Expose ports without publishing them",
	},
	{ label: "ports", type: "keyword", info: "Expose ports" },
	{
		label: "volumes",
		type: "keyword",
		info: "Mount host paths or named volumes",
	},
	{ label: "restart", type: "keyword", info: "Restart policy" },
	{ label: "networks", type: "keyword", info: "Networks to join" },
].map((opt) => ({
	...opt,
	apply: (
		view: EditorView,
		completion: Completion,
		from: number,
		to: number,
	) => {
		const insert = `${completion.label}: `;
		view.dispatch({
			changes: {
				from,
				to,
				insert,
			},
			selection: { anchor: from + insert.length },
		});
	},
}));

function dockerComposeComplete(
	context: CompletionContext,
): CompletionResult | null {
	const word = context.matchBefore(/\w*/);
	if (!word || (!word.text && !context.explicit)) return null;

	// Check if we're at the root level
	const line = context.state.doc.lineAt(context.pos);
	const indentation = /^\s*/.exec(line.text)?.[0].length || 0;

	// If we're at the root level
	if (indentation === 0) {
		return {
			from: word.from,
			options: dockerComposeServices,
			validFor: /^\w*$/,
		};
	}

	// If we're inside a service definition
	if (indentation === 4) {
		return {
			from: word.from,
			options: dockerComposeServiceOptions,
			validFor: /^\w*$/,
		};
	}

	return null;
}

interface Props extends ReactCodeMirrorProps {
	wrapperClassName?: string;
	disabled?: boolean;
	language?: "yaml" | "json" | "properties" | "shell" | "css";
	lineWrapping?: boolean;
	lineNumbers?: boolean;
	showDiffGutter?: boolean;
	diffOriginalValue?: string;
}

type DiffOperationType = "equal" | "add" | "remove";
type DiffMarkerType = "added" | "modified" | "removed";

interface DiffOperation {
	type: DiffOperationType;
	lines: string[];
}

class DiffGutterMarker extends GutterMarker {
	constructor(
		private readonly type: DiffMarkerType | "spacer",
		private readonly label: string,
	) {
		super();
	}

	toDOM() {
		const element = document.createElement("span");
		element.className = `cm-env-diff-marker cm-env-diff-marker-${this.type}`;
		element.setAttribute("aria-hidden", "true");
		if (this.type !== "spacer") {
			element.title = this.label;
		}
		return element;
	}
}

const diffMarkers = {
	added: new DiffGutterMarker("added", "Added line"),
	modified: new DiffGutterMarker("modified", "Modified line"),
	removed: new DiffGutterMarker("removed", "Removed line"),
	spacer: new DiffGutterMarker("spacer", ""),
} as const;

const splitLines = (text: string) => text.replace(/\r\n?/g, "\n").split("\n");
const isBlankLine = (line: string) => line.trim().length === 0;

const pushDiffOperation = (
	operations: DiffOperation[],
	type: DiffOperationType,
	line: string,
) => {
	const previous = operations[operations.length - 1];
	if (previous?.type === type) {
		previous.lines.push(line);
		return;
	}
	operations.push({ type, lines: [line] });
};

const buildDiffOperations = (
	previousValue: string,
	currentValue: string,
): DiffOperation[] => {
	const previousLines = splitLines(previousValue);
	const currentLines = splitLines(currentValue);

	const lcs: number[][] = Array.from({ length: previousLines.length + 1 }, () =>
		Array<number>(currentLines.length + 1).fill(0),
	);

	for (let i = previousLines.length - 1; i >= 0; i -= 1) {
		const currentRow = lcs[i];
		const nextRow = lcs[i + 1];
		if (!currentRow || !nextRow) {
			continue;
		}

		for (let j = currentLines.length - 1; j >= 0; j -= 1) {
			const previousLine = previousLines[i];
			const currentLine = currentLines[j];
			if (previousLine === undefined || currentLine === undefined) {
				continue;
			}

			currentRow[j] =
				previousLine === currentLine
					? (nextRow[j + 1] ?? 0) + 1
					: Math.max(nextRow[j] ?? 0, currentRow[j + 1] ?? 0);
		}
	}

	const operations: DiffOperation[] = [];
	let previousIndex = 0;
	let currentIndex = 0;

	while (
		previousIndex < previousLines.length &&
		currentIndex < currentLines.length
	) {
		const previousLine = previousLines[previousIndex];
		const currentLine = currentLines[currentIndex];
		if (previousLine === undefined || currentLine === undefined) {
			break;
		}

		if (previousLine === currentLine) {
			pushDiffOperation(operations, "equal", currentLine);
			previousIndex += 1;
			currentIndex += 1;
			continue;
		}

		const removeScore = lcs[previousIndex + 1]?.[currentIndex] ?? 0;
		const addScore = lcs[previousIndex]?.[currentIndex + 1] ?? 0;

		if (removeScore >= addScore) {
			pushDiffOperation(operations, "remove", previousLine);
			previousIndex += 1;
			continue;
		}

		pushDiffOperation(operations, "add", currentLine);
		currentIndex += 1;
	}

	while (previousIndex < previousLines.length) {
		const previousLine = previousLines[previousIndex];
		if (previousLine !== undefined) {
			pushDiffOperation(operations, "remove", previousLine);
		}
		previousIndex += 1;
	}

	while (currentIndex < currentLines.length) {
		const currentLine = currentLines[currentIndex];
		if (currentLine !== undefined) {
			pushDiffOperation(operations, "add", currentLine);
		}
		currentIndex += 1;
	}

	return operations;
};

const buildLineMarkers = (
	previousValue: string,
	currentValue: string,
): Map<number, DiffMarkerType> => {
	const lineMarkers = new Map<number, DiffMarkerType>();
	const operations = buildDiffOperations(previousValue, currentValue);
	const currentLines = splitLines(currentValue);
	const currentLineCount = currentLines.length;

	const findNearestNonBlankLine = (startLineNumber: number) => {
		const startIndex = Math.max(
			0,
			Math.min(startLineNumber - 1, currentLineCount - 1),
		);

		for (let index = startIndex; index < currentLineCount; index += 1) {
			const line = currentLines[index];
			if (line !== undefined && !isBlankLine(line)) {
				return index + 1;
			}
		}

		for (let index = startIndex - 1; index >= 0; index -= 1) {
			const line = currentLines[index];
			if (line !== undefined && !isBlankLine(line)) {
				return index + 1;
			}
		}

		return null;
	};

	let currentLine = 1;

	for (let index = 0; index < operations.length; index += 1) {
		const operation = operations[index];
		if (!operation) {
			continue;
		}

		if (operation.type === "equal") {
			currentLine += operation.lines.length;
			continue;
		}

		if (operation.type === "add") {
			const previousOperation = operations[index - 1];
			const isModification = previousOperation?.type === "remove";
			const markerType: DiffMarkerType = isModification ? "modified" : "added";

			for (let i = 0; i < operation.lines.length; i += 1) {
				const lineNumber = currentLine + i;
				const lineText = currentLines[lineNumber - 1];
				if (lineText !== undefined && !isBlankLine(lineText)) {
					lineMarkers.set(lineNumber, markerType);
				}
			}

			currentLine += operation.lines.length;
			continue;
		}

		if (operation.lines.every(isBlankLine)) {
			continue;
		}

		const previousLine = currentLine - 1;
		const anchorLine =
			currentLine <= currentLineCount
				? currentLine
				: previousLine > 0
					? previousLine
					: 1;
		const nonBlankAnchor = findNearestNonBlankLine(anchorLine);
		if (nonBlankAnchor && !lineMarkers.has(nonBlankAnchor)) {
			lineMarkers.set(nonBlankAnchor, "removed");
		}
	}

	return lineMarkers;
};

export const CodeEditor = ({
	className,
	wrapperClassName,
	language = "yaml",
	lineNumbers = true,
	showDiffGutter = false,
	diffOriginalValue = "",
	...props
}: Props) => {
	const { resolvedTheme } = useTheme();
	const currentValue = typeof props.value === "string" ? props.value : "";
	const diffMarkersByLine = useMemo(
		() =>
			showDiffGutter && language === "properties"
				? buildLineMarkers(diffOriginalValue, currentValue)
				: new Map<number, DiffMarkerType>(),
		[showDiffGutter, language, diffOriginalValue, currentValue],
	);

	const diffGutterExtension = useMemo(
		() =>
			showDiffGutter && language === "properties"
				? gutter({
						class: "cm-env-diff-gutter",
						initialSpacer: () => diffMarkers.spacer,
						lineMarker: (view, line) => {
							const lineNumber = view.state.doc.lineAt(line.from).number;
							const lineMarker = diffMarkersByLine.get(lineNumber);
							if (lineMarker === "added") return diffMarkers.added;
							if (lineMarker === "modified") return diffMarkers.modified;
							if (lineMarker === "removed") return diffMarkers.removed;
							return null;
						},
					})
				: null,
		[showDiffGutter, language, diffMarkersByLine],
	);

	return (
		<div className={cn("overflow-auto", wrapperClassName)}>
			<CodeMirror
				basicSetup={{
					lineNumbers,
					foldGutter: true,
					highlightSelectionMatches: true,
					highlightActiveLine: !props.disabled,
					allowMultipleSelections: true,
				}}
				theme={resolvedTheme === "dark" ? githubDark : githubLight}
				extensions={[
					search(),
					keymap.of(searchKeymap),
					language === "yaml"
						? yaml()
						: language === "json"
							? json()
							: language === "css"
								? css()
								: language === "shell"
									? StreamLanguage.define(shell)
									: StreamLanguage.define({
											...properties,
											// The legacy properties mode lacks comment metadata, so
											// CodeMirror's toggle-comment shortcut (Mod-/) has no comment
											// token to use. Declare `#` as the line comment for env editors.
											languageData: { commentTokens: { line: "#" } },
										}),
					props.lineWrapping ? EditorView.lineWrapping : [],
					language === "yaml"
						? autocompletion({
								override: [dockerComposeComplete],
							})
						: [],
					diffGutterExtension ? [diffGutterExtension] : [],
				]}
				{...props}
				editable={!props.disabled}
				className={cn(
					"w-full h-full text-sm leading-relaxed relative",
					`cm-theme-${resolvedTheme}`,
					className,
				)}
			>
				{props.disabled && (
					<div className="absolute top-0 rounded-md left-0 w-full h-full  flex items-center justify-center z-[10] [background:var(--overlay)] h-full" />
				)}
			</CodeMirror>
		</div>
	);
};
