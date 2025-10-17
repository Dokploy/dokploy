import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface NotificationScopeSelectorProps {
	value: "organization" | "project" | "service";
	onChange: (value: "organization" | "project" | "service") => void;
	className?: string;
}

export const NotificationScopeSelector = ({
	value,
	onChange,
	className,
}: NotificationScopeSelectorProps) => {
	const scopeOptions = [
		{
			value: "organization",
			label: "Organization-wide",
			description:
				"Send notifications for all projects and services in the organization",
		},
		{
			value: "project",
			label: "Project-specific",
			description: "Send notifications only for selected projects",
		},
		{
			value: "service",
			label: "Service-specific",
			description: "Send notifications only for selected services",
		},
	];

	return (
		<div className={cn("space-y-3", className)}>
			<Label className="text-sm font-medium">Notification Scope</Label>
			<RadioGroup
				value={value}
				onValueChange={(value) =>
					onChange(value as "organization" | "project" | "service")
				}
				className="space-y-3"
			>
				{scopeOptions.map((option) => (
					<div
						key={option.value}
						className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50"
					>
						<RadioGroupItem
							value={option.value}
							id={option.value}
							className="mt-1"
						/>
						<div className="flex-1 space-y-1">
							<Label
								htmlFor={option.value}
								className="text-sm font-medium cursor-pointer"
							>
								{option.label}
							</Label>
							<p className="text-xs text-muted-foreground">
								{option.description}
							</p>
						</div>
					</div>
				))}
			</RadioGroup>
		</div>
	);
};
