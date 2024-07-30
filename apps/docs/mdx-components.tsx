import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		...defaultComponents,
		...components,
		ImageZoom,
		p: ({ children }) => (
			<p className="text-[#3E4342] dark:text-muted-foreground">{children}</p>
		),
		li: ({ children }) => (
			<li className="text-[#3E4342] dark:text-muted-foreground">{children}</li>
		),
	};
}
