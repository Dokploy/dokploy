import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends React.ComponentPropsWithoutRef<"div"> {
	icon?: React.ReactNode;
	type?: "info" | "success" | "warning" | "error";
}

const iconMap = {
	info: {
		className: "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
		icon: Info,
	},
	success: {
		className:
			"bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
		icon: CheckCircle2,
	},
	warning: {
		className:
			"bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400",
		icon: AlertCircle,
	},
	error: {
		className: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400",
		icon: AlertTriangle,
	},
};

export function AlertBlock({
	type = "info",
	icon,
	children,
	className,
	...props
}: Props) {
	const { className: iconClassName, icon: Icon } = iconMap[type];
	return (
		<div
			{...props}
			className={cn(
				"flex items-start flex-row gap-4 rounded-lg p-2",
				iconClassName,
				className,
			)}
		>
			<div className="flex-shrink-0 mt-0.5">
				{icon || <Icon className="text-current" />}
			</div>
			<div className="flex-1 min-w-0">
				<span className="text-sm text-current break-words overflow-wrap-anywhere whitespace-pre-wrap">
					{children}
				</span>
			</div>
		</div>
	);
}
