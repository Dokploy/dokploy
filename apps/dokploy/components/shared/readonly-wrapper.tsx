import React, { ReactNode, cloneElement, isValidElement } from "react";
import { api } from "@/utils/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, Lock } from "lucide-react";
import {
	useReadOnly,
	getReadOnlyProps,
	getReadOnlyButtonProps,
} from "@/hooks/use-readonly";

interface ReadOnlyWrapperProps {
	serviceId: string;
	children: ReactNode;
	fallback?: ReactNode;
}

export const ReadOnlyWrapper = ({
	serviceId,
	children,
	fallback = null,
}: ReadOnlyWrapperProps) => {
	const { isReadOnly } = useReadOnly({ serviceId });

	// If read-only, show fallback or read-only notification
	if (isReadOnly) {
		if (fallback) {
			return <>{fallback}</>;
		}

		return (
			<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
				<Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
				<AlertDescription className="text-amber-800 dark:text-amber-200">
					<strong>Read-Only Access:</strong> You have view-only permissions for
					this service. Action buttons are disabled. Contact your administrator
					for edit permissions.
				</AlertDescription>
			</Alert>
		);
	}

	// If not read-only, show the children (action buttons)
	return <>{children}</>;
};

interface ReadOnlyIndicatorProps {
	serviceId: string;
	children: ReactNode;
}

export const ReadOnlyIndicator = ({
	serviceId,
	children,
}: ReadOnlyIndicatorProps) => {
	const { data: currentUser } = api.user.get.useQuery();

	// Check if user has read-only access to this service
	const isReadOnly =
		currentUser?.role === "member" &&
		currentUser?.canReadOnlyServices === true &&
		currentUser?.accessedServices?.includes(serviceId);

	if (!isReadOnly) {
		return <>{children}</>;
	}

	return (
		<div className="relative">
			{children}
			<div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-md flex items-center justify-center">
				<div className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs font-medium">
					Read Only
				</div>
			</div>
		</div>
	);
};

interface ReadOnlyNotificationProps {
	serviceId: string;
	serviceName?: string;
}

export const ReadOnlyNotification = ({
	serviceId,
	serviceName = "service",
}: ReadOnlyNotificationProps) => {
	const { isReadOnly } = useReadOnly({ serviceId });

	if (!isReadOnly) {
		return null;
	}

	return (
		<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
			<Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
			<AlertDescription className="text-amber-800 dark:text-amber-200">
				<strong>Read-Only Access:</strong> You have view-only permissions for
				this {serviceName}. Action buttons are disabled. Contact your
				administrator for edit permissions.
			</AlertDescription>
		</Alert>
	);
};

interface ReadOnlyFormWrapperProps {
	serviceId: string;
	children: ReactNode;
	showNotification?: boolean;
}

export const ReadOnlyFormWrapper = ({
	serviceId,
	children,
	showNotification = true,
}: ReadOnlyFormWrapperProps) => {
	const { isReadOnly } = useReadOnly({ serviceId });

	// Event handler to prevent all interactions
	const preventAllInteractions = (e: React.SyntheticEvent) => {
		if (isReadOnly) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
	};

	// Clone children and apply read-only props to interactive elements
	const cloneChildren = (children: ReactNode): ReactNode => {
		return React.Children.map(children, (child) => {
			if (!isValidElement(child)) {
				return child;
			}

			// Apply read-only props to buttons, inputs, and other interactive elements
			const readOnlyProps = getReadOnlyProps(isReadOnly);
			const buttonProps = getReadOnlyButtonProps(isReadOnly);

			// Get the component name for better detection
			const componentName =
				(typeof child.type === 'function' && 'displayName' in child.type && child.type.displayName) || 
				(typeof child.type === 'function' && 'name' in child.type && child.type.name) || 
				child.type;

			// Skip if already processed (prevent duplication) - only in read-only mode
			if (isReadOnly && child.props && child.props["data-readonly-processed"]) {
				return child;
			}

			// Check if it's a button or has button-like behavior
			if (
				componentName === "button" ||
				componentName === "Button" ||
				componentName === "DialogTrigger" ||
				componentName === "DropdownMenuTrigger" ||
				componentName === "TooltipTrigger" ||
				componentName === "PopoverTrigger" ||
				componentName === "TabsTrigger" ||
				componentName === "AccordionTrigger" ||
				componentName === "CollapsibleTrigger" ||
				(child.props &&
					(child.props.onClick ||
						child.props.onSubmit ||
						child.props.onChange ||
						child.props.disabled === false ||
						child.props.type === "submit" ||
						child.props.type === "button" ||
						child.props.asChild ||
						child.props.role === "button"))
			) {
				return cloneElement(child, {
					...buttonProps,
					...child.props,
					...(isReadOnly && { "data-readonly-processed": true }),
				});
			}

			// Special handling for RadioGroupItem - allow functionality even in read-only mode
			if (componentName === "RadioGroupItem") {
				// In read-only mode, allow radio button to work but with visual indication
				if (isReadOnly) {
					return cloneElement(child, {
						...child.props,
						className: `${child.props.className || ""} opacity-75`,
						"data-readonly-processed": true,
						// Allow onChange to work normally
						onChange: child.props.onChange,
						onValueChange: child.props.onValueChange,
					});
				}
				// In normal mode, return as-is
				return child;
			}

			// Special handling for Checkbox - allow functionality even in read-only mode
			if (componentName === "Checkbox") {
				// In read-only mode, allow checkbox to work but with visual indication
				if (isReadOnly) {
					return cloneElement(child, {
						...child.props,
						className: `${child.props.className || ""} opacity-75`,
						"data-readonly-processed": true,
						// Allow onCheckedChange to work normally
						onCheckedChange: child.props.onCheckedChange,
					});
				}
				// In normal mode, return as-is
				return child;
			}

			// Check if it's an input, textarea, select, or form element (excluding checkboxes)
			if (
				componentName === "input" ||
				componentName === "textarea" ||
				componentName === "select" ||
				componentName === "Input" ||
				componentName === "Textarea" ||
				componentName === "Select" ||
				componentName === "SelectTrigger" ||
				componentName === "SelectContent" ||
				componentName === "SelectItem" ||
				componentName === "form" ||
				componentName === "Form" ||
				componentName === "Switch" ||
				componentName === "Slider" ||
				componentName === "Range" ||
				componentName === "Textarea" ||
				componentName === "Label" ||
				(child.props &&
					(child.props.type === "text" ||
						child.props.type === "email" ||
						child.props.type === "password" ||
						child.props.type === "number" ||
						child.props.type === "tel" ||
						child.props.type === "url" ||
						child.props.type === "search" ||
						(child.props.type === "radio" &&
							componentName !== "RadioGroupItem") ||
						(child.props.type === "checkbox" && componentName !== "Checkbox") ||
						(child.props.value !== undefined &&
							child.props.type !== "checkbox") ||
						(child.props.defaultValue !== undefined &&
							child.props.type !== "checkbox") ||
						(child.props.checked !== undefined &&
							child.props.type !== "checkbox") ||
						(child.props.onValueChange &&
							child.props.type !== "checkbox" &&
							componentName !== "RadioGroupItem") ||
						(child.props.onCheckedChange && componentName !== "Checkbox")))
			) {
				return cloneElement(child, {
					...readOnlyProps,
					...child.props,
					...(isReadOnly && { "data-readonly-processed": true }),
				});
			}

			// Special handling for RadioGroup - don't disable the container, just the items
			if (componentName === "RadioGroup") {
				// Only process recursively in read-only mode
				if (isReadOnly && child.props && child.props.children) {
					return cloneElement(child, {
						...child.props,
						children: cloneChildren(child.props.children),
					});
				}
				return child;
			}

			// Check for specific interactive components by className or other props
			if (
				child.props &&
				(child.props.className?.includes("btn") ||
					child.props.className?.includes("button") ||
					child.props.className?.includes("form-control") ||
					child.props.className?.includes("input") ||
					child.props.className?.includes("switch") ||
					child.props.className?.includes("checkbox") ||
					child.props.className?.includes("radio") ||
					child.props.className?.includes("slider") ||
					child.props.className?.includes("select") ||
					child.props.role === "button" ||
					child.props.role === "textbox" ||
					child.props.role === "combobox" ||
					child.props.role === "switch" ||
					child.props.role === "checkbox" ||
					child.props.role === "radio" ||
					child.props.tabIndex !== undefined ||
					child.props.ariaExpanded !== undefined ||
					child.props.ariaPressed !== undefined)
			) {
				return cloneElement(child, {
					...buttonProps,
					...child.props,
				});
			}

			// Recursively apply to children
			if (child.props && child.props.children) {
				return cloneElement(child, {
					...child.props,
					children: cloneChildren(child.props.children),
				});
			}

			return child;
		});
	};

	return (
		<div
			className={isReadOnly ? "readonly-mode" : ""}
			onClick={preventAllInteractions}
			onSubmit={preventAllInteractions}
			onChange={preventAllInteractions}
			onKeyDown={preventAllInteractions}
			onKeyUp={preventAllInteractions}
			onFocus={preventAllInteractions}
			onBlur={preventAllInteractions}
			onMouseDown={preventAllInteractions}
			onMouseUp={preventAllInteractions}
			onTouchStart={preventAllInteractions}
			onTouchEnd={preventAllInteractions}
		>
			{showNotification && isReadOnly && (
				<ReadOnlyNotification serviceId={serviceId} />
			)}
			{cloneChildren(children)}
		</div>
	);
};
