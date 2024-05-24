import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface Props extends ReactCodeMirrorProps {
	wrapperClassName?: string;
  disabled?: boolean
}

function CodeEditor({ className, wrapperClassName, ...props }: Props) {
	const { resolvedTheme } = useTheme();

	return (
		<div className={wrapperClassName}>
			<CodeMirror
				basicSetup={{
					lineNumbers: false,
					foldGutter: false,
          highlightActiveLine: !props.disabled
				}}
				theme={resolvedTheme === "dark" ? githubDark : githubLight}
				extensions={[yaml(), json()]}
				{...props}
        editable={!props.disabled}
				className={cn("w-full h-full text-sm leading-relaxed", `cm-theme-${resolvedTheme}`, className)}
			/>
		</div>
	);
}

export default CodeEditor;
