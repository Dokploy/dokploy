import { cn } from "@/lib/utils";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";

import { properties } from "@codemirror/legacy-modes/mode/properties";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorView } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
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
		<div className={cn("relative overflow-auto", wrapperClassName)}>
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
				]}
				{...props}
				editable={!props.disabled}
				className={cn(
					"w-full h-full text-sm leading-relaxed",
					`cm-theme-${resolvedTheme}`,
					className,
				)}
			/>
			{props.disabled && (
				<div className="absolute top-0 rounded-md left-0 w-full h-full  flex items-center justify-center z-[10] [background:var(--overlay)]" />
			)}
		</div>
	);
};
