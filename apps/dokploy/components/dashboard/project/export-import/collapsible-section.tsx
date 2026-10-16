import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CollapsibleSectionProps {
	title: ReactNode;
	children: ReactNode;
	className?: string;
	triggerClassName?: string;
	contentClassName?: string;
}

export const CollapsibleSection = ({
	title,
	children,
	className,
	triggerClassName = "flex items-center gap-1 text-sm font-medium",
	contentClassName = "space-y-2 pt-2",
}: CollapsibleSectionProps) => {
	const [open, setOpen] = useState(false);
	return (
		<Collapsible open={open} onOpenChange={setOpen} className={className}>
			<CollapsibleTrigger className={triggerClassName}>
				<ChevronDown
					className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
				/>
				{title}
			</CollapsibleTrigger>
			<CollapsibleContent className={contentClassName}>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
};
