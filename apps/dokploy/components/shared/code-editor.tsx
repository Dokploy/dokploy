import { cn } from "@/lib/utils";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
interface Props extends ReactCodeMirrorProps {
	wrapperClassName?: string;
	disabled?: boolean;
	language?: "yaml" | "json" | "properties";
}

export const CodeEditor = ({
	className,
	wrapperClassName,
	language = "yaml",
	...props
}: Props) => {
	const { resolvedTheme } = useTheme();
	return (
		<div className={cn("relative overflow-auto", wrapperClassName)}>
			<CodeMirror
				basicSetup={{
					lineNumbers: true,
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
							: StreamLanguage.define(properties),
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
