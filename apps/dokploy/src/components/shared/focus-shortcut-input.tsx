import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

type Props = React.ComponentPropsWithoutRef<typeof Input>;

export const FocusShortcutInput = (props: Props) => {
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey;
			if (!isMod || e.key.toLowerCase() !== "k") return;

			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName;
				if (
					target.isContentEditable ||
					tag === "INPUT" ||
					tag === "TEXTAREA" ||
					tag === "SELECT" ||
					target.getAttribute("role") === "textbox"
				)
					return;
			}

			e.preventDefault();
			inputRef.current?.focus();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return <Input {...props} ref={inputRef} />;
};
