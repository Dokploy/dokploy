import { useEffect } from "react";

interface ScriptProps {
	src?: string;
	id?: string;
	strategy?: string;
	onLoad?: () => void;
	onError?: () => void;
	children?: string;
	dangerouslySetInnerHTML?: { __html: string };
	[key: string]: unknown;
}

const Script = ({
	src,
	id,
	strategy: _strategy,
	onLoad,
	onError,
	children,
	dangerouslySetInnerHTML,
}: ScriptProps) => {
	useEffect(() => {
		if (src && document.querySelector(`script[src="${src}"]`)) return;
		if (id && document.getElementById(id)) return;

		const script = document.createElement("script");
		if (src) script.src = src;
		if (id) script.id = id;
		const inline = dangerouslySetInnerHTML?.__html ?? children;
		if (!src && inline) script.textContent = inline;
		if (onLoad) script.onload = onLoad;
		if (onError) script.onerror = onError;
		document.body.appendChild(script);
	}, [src, id]);

	return null;
};

export default Script;
