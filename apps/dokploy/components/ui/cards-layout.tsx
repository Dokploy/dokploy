import { LayoutGridIcon, LayoutListIcon } from "lucide-react";
import React, { useEffect } from "react";
import { Toggle } from "@/components/ui/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export enum Layout {
	GRID = "grid",
	LIST = "list",
}

export type CardsLayoutProps = React.HTMLAttributes<HTMLDivElement> & {
	layout: Layout;
};

/**
 * Retrieves the default layout for the cards, either from localStorage or defaults to "grid".
 * @returns The default layout, either "grid" or "list".
 */
export function getDefaultLayout(): Layout {
	if (typeof window !== "undefined") {
		const savedLayout = localStorage.getItem("servicesLayout") as Layout;
		if (savedLayout === Layout.GRID || savedLayout === Layout.LIST) {
			return savedLayout;
		}
	}
	return Layout.GRID; // Default layout
}

/**
 * LayoutSwitcher component that allows users to toggle between grid and list layouts for displaying cards. It uses a Toggle button to switch layouts and a Tooltip to provide context on the action. The selected layout is saved in localStorage to persist user preference across sessions.
 * @param layout The layout to use for the cards, either "grid" or "list".
 * @param setLayout Function to update the layout state in the parent component.
 * @example
 * const [layout, setLayout] = useState<Layout>(() => getDefaultLayout());
 * @returns JSX.Element
 */
const LayoutSwitcher = ({
	layout,
	setLayout,
}: {
	layout: Layout;
	setLayout: (layout: Layout) => void;
}) => {
	const iconClass = "w-5 h-5";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Toggle
					aria-label="Toggle layout"
					variant="outline"
					pressed={layout === getDefaultLayout()}
					onPressedChange={(pressed) =>
						setLayout(pressed ? Layout.GRID : Layout.LIST)
					}
				>
					{layout === Layout.GRID ? (
						<LayoutGridIcon className={iconClass} />
					) : (
						<LayoutListIcon className={iconClass} />
					)}
				</Toggle>
			</TooltipTrigger>
			<TooltipContent>
				<p>Switch to {layout === Layout.GRID ? "list" : "grid"} view</p>
			</TooltipContent>
		</Tooltip>
	);
};


/**
 * CardsLayout component that wraps its children in a grid or list layout based on the provided layout prop. It also saves the user's layout preference in localStorage.
 *
 * @param layout The layout to use for the cards, either "grid" or "list".
 * @example Layout state should be managed this way in the parent component:
 * const [layout, setLayout] = useState<Layout>(() => getDefaultLayout());
 *
 * <CardsLayout layout={layout}>
 *   {children}
 * </CardsLayout>
 *
 * The LayoutSwitcher component can be used to toggle between grid and list layouts, and it will update the layout state in the parent component accordingly.
 *
 * <LayoutSwitcher layout={layout} setLayout={setLayout} />
 *
 * This implementation ensures that the user's layout preference is persisted across sessions and provides an easy way to switch between different layouts.
 * @returns JSX.Element
 */
const CardsLayout = React.forwardRef<HTMLDivElement, CardsLayoutProps>(
	({ layout, className, children, ...props }, ref) => {
		useEffect(() => {
			localStorage.setItem("servicesLayout", layout);
		}, [layout]);
		return (
			<section className="flex flex-col gap-4">
				<div
					className={cn(
						layout === Layout.GRID
							? "gap-5 pb-10 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5"
							: "flex flex-col gap-4 w-full",
						className,
					)}
					ref={ref}
					{...props}
				>
					{children}
				</div>
			</section>
		);
	},
);

CardsLayout.displayName = "CardsLayout";
LayoutSwitcher.displayName = "LayoutSwitcher";

export { CardsLayout, LayoutSwitcher };
