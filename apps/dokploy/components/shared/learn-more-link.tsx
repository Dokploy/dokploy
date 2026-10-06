import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Low-weight "Learn more" link to an external page: muted text, underline on
 * hover, external-link glyph. Always opens in a new tab.
 */
export const LearnMoreLink = ({
	href,
	label = "Learn more",
	className,
}: {
	href: string;
	label?: string;
	className?: string;
}) => (
	<a
		href={href}
		target="_blank"
		rel="noopener noreferrer"
		className={cn(
			"inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
			className,
		)}
	>
		{label}
		<ExternalLink className="size-3" />
	</a>
);
