import { UptimelyLogo } from "@/components/icons/product-logos";
import { cn } from "@/lib/utils";

export const UPTIMELY_SITE_URL = "https://getuptimely.com";

/** The product's official logo (app-icon tile), sized by the caller. */
export const UptimelyMark = ({ className }: { className?: string }) => (
	<UptimelyLogo className={className} />
);

export const PoweredByUptimely = ({ className }: { className?: string }) => (
	<div
		className={cn(
			"flex items-center justify-end gap-1 text-xs text-muted-foreground",
			className,
		)}
	>
		<span>Powered by</span>
		<a
			href={UPTIMELY_SITE_URL}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-foreground hover:underline"
		>
			Uptimely
		</a>
	</div>
);
