import { DoDomainLogo } from "@/components/icons/product-logos";
import { cn } from "@/lib/utils";

export const DODOMAIN_SITE_URL = "https://dodomain.io";

/** The product's official logo (app-icon tile), sized by the caller. */
export const DoDomainMark = ({ className }: { className?: string }) => (
	<DoDomainLogo className={className} />
);

export const PoweredByDoDomain = ({ className }: { className?: string }) => (
	<div
		className={cn(
			"flex items-center justify-end gap-1 text-xs text-muted-foreground",
			className,
		)}
	>
		<span>Domain connect by</span>
		<a
			href={DODOMAIN_SITE_URL}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-foreground hover:underline"
		>
			DoDomain
		</a>
	</div>
);
