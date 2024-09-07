"use client";

import { Link } from "@/i18n/routing";
import { trackGAEvent } from "./analitycs";

export function NavLink({
	href,
	children,
	target,
}: {
	href: string;
	children: React.ReactNode;
	target?: string;
}) {
	return (
		<div>
			<Link
				href={href}
				onClick={() =>
					trackGAEvent({
						action: "Nav Link Clicked",
						category: "Navigation",
						label: href,
					})
				}
				target={target}
				className="inline-block self-center rounded-lg px-2.5 py-1.5 text-sm text-popover-foreground  font-medium transition-colors hover:text-primary hover:bg-secondary"
			>
				{children}
			</Link>
		</div>
	);
}
