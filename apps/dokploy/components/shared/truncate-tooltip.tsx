import { Tooltip as TooltipPrimitive } from "radix-ui";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLParagraphElement> {
	text: string;
}

export const TruncateTooltip = ({ text, className, ...props }: Props) => {
	const textRef = useRef<HTMLParagraphElement>(null);
	const [isTruncated, setIsTruncated] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		const element = textRef.current;
		if (!element) return;

		const checkTruncation = () => {
			const truncated = element.scrollWidth > element.clientWidth;
			setIsTruncated(truncated);
			if (!truncated) {
				setIsOpen(false);
			}
		};

		checkTruncation();

		const resizeObserver = new ResizeObserver(() => {
			checkTruncation();
		});

		resizeObserver.observe(element);

		return () => {
			resizeObserver.disconnect();
		};
	}, [text]);

	const content = (
		<p ref={textRef} className={cn("truncate", className)} {...props}>
			{text}
		</p>
	);

	return (
		<TooltipProvider>
			<Tooltip
				delayDuration={0}
				open={isOpen}
				onOpenChange={(open) => {
					// Only allow opening if it's actually truncated
					if (isTruncated) {
						setIsOpen(open);
					} else {
						setIsOpen(false);
					}
				}}
			>
				<TooltipTrigger asChild>{content}</TooltipTrigger>
				<TooltipPrimitive.Portal>
					<TooltipPrimitive.Content
						side="bottom"
						align="start"
						className="z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md max-w-[280px] break-words animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
					>
						<p>{text}</p>
					</TooltipPrimitive.Content>
				</TooltipPrimitive.Portal>
			</Tooltip>
		</TooltipProvider>
	);
};
