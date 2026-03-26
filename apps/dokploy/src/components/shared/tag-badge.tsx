import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagBadgeProps {
	name: string;
	color?: string | null;
	className?: string;
	children?: React.ReactNode;
}

export function TagBadge({ name, color, className, children }: TagBadgeProps) {
	return (
		<Badge
			style={{
				backgroundColor: color ? `${color}33` : undefined,
				color: color || undefined,
				borderColor: color ? `${color}66` : undefined,
			}}
			className={cn("border", className)}
		>
			{name}
			{children}
		</Badge>
	);
}
