import { cn } from "@/lib/utils";
import { type RefObject, useEffect, useRef, useState } from "react";

export const useScrollFade = <T extends HTMLElement>(
	deps: unknown[] = [],
): [RefObject<T | null>, boolean, boolean] => {
	const ref = useRef<T>(null);
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return [ref, canScrollLeft, canScrollRight];
};

export const ScrollFadeEdges = ({
	canScrollLeft,
	canScrollRight,
}: {
	canScrollLeft: boolean;
	canScrollRight: boolean;
}) => (
	<>
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
	</>
);

interface Props {
	children: React.ReactNode;
	className?: string;
}

export const ScrollFadeContainer = ({ children, className }: Props) => {
	const [ref, canScrollLeft, canScrollRight] =
		useScrollFade<HTMLDivElement>([children]);

	return (
		<div className="relative min-w-0">
			<div
				ref={ref}
				className={cn("overflow-x-auto no-scrollbar", className)}
			>
				{children}
			</div>
			<ScrollFadeEdges
				canScrollLeft={canScrollLeft}
				canScrollRight={canScrollRight}
			/>
		</div>
	);
};
