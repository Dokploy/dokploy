import { cn } from "@/lib/utils";
import { Globe, Shield, Key } from "lucide-react";

interface DomainProviderIconProps {
	className?: string;
	type: "netlify" | "namecheap" | string;
}

export const DomainProviderIcon = ({
	className,
	type,
}: DomainProviderIconProps) => {
	switch (type) {
		case "netlify":
			return (
				<Shield
					className={cn(
						"h-6 w-6 text-muted-foreground self-center",
						className
					)}
				/>
			);
		case "namecheap":
			return (
				<Key
					className={cn(
						"h-6 w-6 text-muted-foreground self-center",
						className
					)}
				/>
			);
		default:
			return (
				<Globe
					className={cn(
						"h-6 w-6 text-muted-foreground self-center",
						className
					)}
				/>
			);
	}
};