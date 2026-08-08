import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface Props {
	children: React.ReactNode;
	className?: string;
}

export const ScrollFadeContainer = ({ children, className }: Props) => {
	const ref = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const updateFades = () => {
			setCanScrollLeft(el.scrollLeft > 0);
			setCanScrollRight(
				Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth,
			);
		};

		updateFades();

		el.addEventListener("scroll", updateFades, { passive: true });
		const resizeObserver = new ResizeObserver(updateFades);
		resizeObserver.observe(el);

		return () => {
			el.removeEventListener("scroll", updateFades);
			resizeObserver.disconnect();
		};
	}, [children]);

	return (
		<div className="relative min-w-0">
			<div
				ref={ref}
				className={cn("overflow-x-auto no-scrollbar", className)}
			>
				{children}
			</div>
			<div
				className={cn(
					"pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity",
					canScrollLeft ? "opacity-100" : "opacity-0",
				)}
			/>
			<div
				className={cn(
					"pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity",
					canScrollRight ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
};
