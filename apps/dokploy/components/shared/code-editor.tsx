import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
	type CompletionSource,
} from "@codemirror/autocomplete";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import {
	getIndentUnit,
	indentService,
	StreamLanguage,
} from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { search, searchKeymap } from "@codemirror/search";
import { EditorView, keymap } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Docker Compose completion options
const dockerComposeServices = [
	{
		label: "services",
		type: "keyword",
		infoKey: "shared.completion.defineServices",
	},
	{
		label: "version",
		type: "keyword",
		infoKey: "shared.completion.specifyVersion",
	},
	{
		label: "volumes",
		type: "keyword",
		infoKey: "shared.completion.defineVolumes",
	},
	{
		label: "networks",
		type: "keyword",
		infoKey: "shared.completion.defineNetworks",
	},
	{
		label: "configs",
		type: "keyword",
		infoKey: "shared.completion.defineConfigs",
	},
	{
		label: "secrets",
		type: "keyword",
		infoKey: "shared.completion.defineSecrets",
	},
	{
		label: "models",
		type: "keyword",
		infoKey: "shared.completion.defineModels",
	},
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
		infoKey: "shared.completion.specifyImage",
	},
	{ label: "build", type: "keyword", infoKey: "shared.completion.buildConfig" },
	{
		label: "command",
		type: "keyword",
		infoKey: "shared.completion.overrideCommand",
	},
	{
		label: "container_name",
		type: "keyword",
		infoKey: "shared.completion.customContainerName",
	},
	{
		label: "depends_on",
		type: "keyword",
		infoKey: "shared.completion.expressDependency",
	},
	{
		label: "environment",
		type: "keyword",
		infoKey: "shared.completion.addEnvironmentVariables",
	},
	{
		label: "env_file",
		type: "keyword",
		infoKey: "shared.completion.addEnvironmentVariablesFromFile",
	},
	{
		label: "expose",
		type: "keyword",
		infoKey: "shared.completion.exposePortsWithoutPublishing",
	},
	{ label: "ports", type: "keyword", infoKey: "shared.completion.exposePorts" },
	{
		label: "volumes",
		type: "keyword",
		infoKey: "shared.completion.mountHostPaths",
	},
	{
		label: "restart",
		type: "keyword",
		infoKey: "shared.completion.restartPolicy",
	},
	{
		label: "networks",
		type: "keyword",
		infoKey: "shared.completion.networksToJoin",
	},
	{
		label: "models",
		type: "keyword",
		infoKey: "shared.completion.aiModelsToUse",
	},
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

// The indentNodeProp shipped with @codemirror/lang-yaml computes wrong
// column-based indents on Enter (odd/inconsistent amounts, see #4650), so
// indentation is resolved line-based here: keep the current indent, align
// list-entry keys after the dash marker, and go one unit deeper after a
// line that opens a block (ending in ":", "|" or ">").
const yamlIndent = indentService.of((context, pos) => {
	const line = context.state.doc.lineAt(pos);
	const before = context.state.doc.sliceString(line.from, pos);
	const indent = /^ */.exec(before)?.[0].length ?? 0;
	const trimmed = before.trim();
	if (!trimmed || trimmed.startsWith("#")) {
		return indent;
	}
	const base =
		trimmed.startsWith("- ") && /:\s/.test(trimmed) ? indent + 2 : indent;
	if (/[:|>]$/.test(trimmed)) {
		return base + getIndentUnit(context.state);
	}
	return base;
});

function dockerComposeComplete(
	context: CompletionContext,
	t: (key: string) => string,
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
			options: dockerComposeServices.map((opt) => ({
				...opt,
				info: t(opt.infoKey),
			})),
			validFor: /^\w*$/,
		};
	}

	// If we're inside a service definition
	if (indentation === 4) {
		return {
			from: word.from,
			options: dockerComposeServiceOptions.map((opt) => ({
				...opt,
				info: t(opt.infoKey),
			})),
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
	completionSource?: CompletionSource;
}

export const CodeEditor = ({
	className,
	wrapperClassName,
	language = "yaml",
	lineNumbers = true,
	completionSource,
	...props
}: Props) => {
	const { resolvedTheme } = useTheme();
	const { t } = useTranslation();
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
						? [yamlIndent, yaml()]
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
					completionSource
						? autocompletion({
								override: [completionSource],
							})
						: language === "yaml"
							? autocompletion({
									override: [(context) => dockerComposeComplete(context, t)],
								})
							: [],
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
					<div className="absolute top-0 rounded-md left-0 w-full h-full  flex items-center justify-center z-10 [background:var(--overlay)] h-full" />
				)}
			</CodeMirror>
		</div>
	);
};
