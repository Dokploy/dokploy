import React, { ReactNode } from "react";
import { useReadOnly } from "@/hooks/use-readonly";

interface ReadOnlyViewWrapperProps {
	serviceId: string;
	children: ReactNode;
	allowedActions?: string[];
}

// Component that allows specific view-only actions even in read-only mode
export const ReadOnlyViewWrapper = ({
	serviceId,
	children,
	allowedActions = ["view", "logs", "eye", "view-button", "deployment-view"],
}: ReadOnlyViewWrapperProps) => {
	const { isReadOnly } = useReadOnly({ serviceId });

	// If not read-only, show children normally
	if (!isReadOnly) {
		return <>{children}</>;
	}

	// Clone children and selectively enable certain actions
	const cloneChildren = (children: ReactNode): ReactNode => {
		return React.Children.map(children, (child) => {
			if (!React.isValidElement(child)) {
				return child;
			}

			// Check if this is a button or interactive element
			const componentName =
				child.type?.displayName || child.type?.name || child.type;
			const props = child.props || {};

			// Always disable Save, Update, Submit, and other modification actions
			const isModificationAction =
				props.children === "Save" ||
				props.children === "save" ||
				props.children === "Update" ||
				props.children === "update" ||
				props.children === "Submit" ||
				props.children === "submit" ||
				props.children === "Deploy" ||
				props.children === "deploy" ||
				props.children === "Add" ||
				props.children === "add" ||
				props.children === "Delete" ||
				props.children === "delete" ||
				props.children === "Configure" ||
				props.children === "configure" ||
				props.type === "submit" ||
				props["aria-label"]?.toLowerCase().includes("save") ||
				props["aria-label"]?.toLowerCase().includes("update") ||
				props["aria-label"]?.toLowerCase().includes("submit") ||
				props["aria-label"]?.toLowerCase().includes("deploy") ||
				props["aria-label"]?.toLowerCase().includes("add") ||
				props["aria-label"]?.toLowerCase().includes("delete") ||
				props["aria-label"]?.toLowerCase().includes("configure");

			// Allow specific view-only actions
			const isViewAction =
				!isModificationAction &&
				allowedActions.some((action) => {
					// Check button text/content
					if (
						typeof props.children === "string" &&
						props.children.toLowerCase().includes(action.toLowerCase())
					) {
						return true;
					}

					// Check aria-label
					if (
						props["aria-label"] &&
						props["aria-label"].toLowerCase().includes(action.toLowerCase())
					) {
						return true;
					}

					// Check title
					if (
						props.title &&
						props.title.toLowerCase().includes(action.toLowerCase())
					) {
						return true;
					}

					// Check specific component types for view actions
					if (
						action === "eye" &&
						(componentName === "EyeIcon" ||
							componentName === "EyeOffIcon" ||
							componentName === "Toggle" ||
							props.className?.includes("eye") ||
							props["aria-label"]?.toLowerCase().includes("toggle"))
					) {
						return true;
					}

					if (
						action === "view-button" &&
						(props.children === "View" ||
							props.children === "view" ||
							props.className?.includes("view"))
					) {
						return true;
					}

					if (
						action === "logs" &&
						(props.children === "Logs" ||
							props.children === "logs" ||
							props.className?.includes("log"))
					) {
						return true;
					}

					return false;
				});

			// If it's a view action, allow it to work normally
			if (isViewAction) {
				// Special handling for Toggle component (eye icon)
				if (componentName === "Toggle" && allowedActions.includes("eye")) {
					return child; // Allow Toggle to work normally
				}
				return child;
			}

			// For modification actions, always disable them
			if (isModificationAction) {
				return React.cloneElement(child, {
					...props,
					disabled: true,
					className: `${props.className || ""} opacity-50 pointer-events-none cursor-not-allowed`,
					onClick: (e: React.MouseEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
					onSubmit: (e: React.FormEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
					onChange: (e: React.ChangeEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
				});
			}

			// For other interactive elements, disable them
			if (
				componentName === "button" ||
				componentName === "Button" ||
				props.onClick ||
				props.onSubmit ||
				props.onChange
			) {
				return React.cloneElement(child, {
					...props,
					disabled: true,
					className: `${props.className || ""} opacity-50 pointer-events-none cursor-not-allowed`,
					onClick: (e: React.MouseEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
					onSubmit: (e: React.FormEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
					onChange: (e: React.ChangeEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
				});
			}

			// For form inputs, make them read-only but visible
			if (
				componentName === "input" ||
				componentName === "textarea" ||
				componentName === "select" ||
				componentName === "Input" ||
				componentName === "Textarea" ||
				componentName === "Select" ||
				componentName === "RadioGroup" ||
				componentName === "RadioGroupItem" ||
				componentName === "Switch" ||
				componentName === "Checkbox"
			) {
				return React.cloneElement(child, {
					...props,
					readOnly: true,
					disabled: true,
					className: `${props.className || ""} bg-gray-50 cursor-not-allowed opacity-75`,
					onChange: (e: React.ChangeEvent) => {
						e.preventDefault();
						e.stopPropagation();
					},
					onCheckedChange: (checked: boolean) => {
						// Prevent checkbox/switch changes
					},
					onValueChange: (value: string) => {
						// Prevent radio group changes
					},
				});
			}

			// Recursively apply to children
			if (props.children) {
				return React.cloneElement(child, {
					...props,
					children: cloneChildren(props.children),
				});
			}

			return child;
		});
	};

	// Prevent form submissions
	const preventFormSubmission = (e: React.FormEvent) => {
		if (isReadOnly) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
	};

	return (
		<div className="space-y-4" onSubmit={preventFormSubmission}>
			{cloneChildren(children)}
		</div>
	);
};
