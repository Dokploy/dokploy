import {
	autocompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
} from "@codemirror/autocomplete";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
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
	language?: "yaml" | "json" | "properties" | "shell";
	lineWrapping?: boolean;
	lineNumbers?: boolean;
}

export const CodeEditor = ({
	className,
	wrapperClassName,
	language = "yaml",
	lineNumbers = true,
	...props
}: Props) => {
	const { resolvedTheme } = useTheme();
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
					language === "yaml"
						? yaml()
						: language === "json"
							? json()
							: language === "shell"
								? StreamLanguage.define(shell)
								: StreamLanguage.define(properties),
					props.lineWrapping ? EditorView.lineWrapping : [],
					language === "yaml"
						? autocompletion({
								override: [dockerComposeComplete],
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
					<div className="absolute top-0 rounded-md left-0 w-full h-full  flex items-center justify-center z-[10] [background:var(--overlay)] h-full" />
				)}
			</CodeMirror>
		</div>
	);
};
