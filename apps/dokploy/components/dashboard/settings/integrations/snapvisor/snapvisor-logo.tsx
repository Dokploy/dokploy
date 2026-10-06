import { SnapvisorLogo } from "@/components/icons/product-logos";
import { cn } from "@/lib/utils";

export const SNAPVISOR_SITE_URL = "https://snapvisor.io";

/** The product's official logo (app-icon tile), sized by the caller. */
export const SnapvisorMark = ({ className }: { className?: string }) => (
	<SnapvisorLogo className={className} />
);

export const PoweredBySnapvisor = ({ className }: { className?: string }) => (
	<div
		className={cn(
			"flex items-center justify-end gap-1 text-xs text-muted-foreground",
			className,
		)}
	>
		<span>Visual testing by</span>
		<a
			href={SNAPVISOR_SITE_URL}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-foreground hover:underline"
		>
			Snapvisor
		</a>
	</div>
);
