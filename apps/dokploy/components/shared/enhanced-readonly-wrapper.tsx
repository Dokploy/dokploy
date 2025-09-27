import React, { ReactNode, cloneElement, isValidElement } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Eye, Shield, AlertTriangle } from "lucide-react";
import { api } from "@/utils/api";

interface EnhancedReadOnlyWrapperProps {
	serviceId: string;
	children: ReactNode;
	fallback?: ReactNode;
	showDetailedInfo?: boolean;
	permissionContext?: {
		resourceType?: string;
		action?: string;
		showPermissionDetails?: boolean;
	};
}

export const EnhancedReadOnlyWrapper = ({
	serviceId,
	children,
	fallback = null,
	showDetailedInfo = true,
	permissionContext = {},
}: EnhancedReadOnlyWrapperProps) => {
	const { data: currentUser } = api.user.get.useQuery();

	// Check if user has read-only access to this service
	const isReadOnly =
		currentUser?.role === "member" &&
		currentUser?.canReadOnlyServices === true &&
		currentUser?.accessedServices?.includes(serviceId);

	// If read-only, show fallback or enhanced read-only notification
	if (isReadOnly) {
		if (fallback) {
			return <>{fallback}</>;
		}

		return (
			<div className="space-y-4">
				{/* Enhanced Read-Only Alert */}
				<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
					<Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
					<AlertDescription className="text-amber-800 dark:text-amber-200">
						<div className="flex items-center justify-between">
							<div>
								<strong>Read-Only Access</strong>
								<p className="text-sm mt-1">
									You have view-only permissions for this service. Action buttons are disabled.
								</p>
							</div>
							<Badge variant="outline" className="text-amber-600 border-amber-300">
								<Lock className="h-3 w-3 mr-1" />
								Read Only
							</Badge>
						</div>
					</AlertDescription>
				</Alert>

				{/* Detailed Permission Information */}
				{showDetailedInfo && (
					<Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm flex items-center gap-2">
								<Eye className="h-4 w-4 text-blue-600" />
								Permission Details
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="space-y-2 text-sm">
								<div className="flex justify-between">
									<span className="text-muted-foreground">Service ID:</span>
									<code className="text-xs bg-muted px-1 py-0.5 rounded">{serviceId}</code>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">User Role:</span>
									<Badge variant="secondary" className="text-xs">
										{currentUser?.role || "Unknown"}
									</Badge>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Read-Only Access:</span>
									<Badge variant="outline" className="text-xs">
										{currentUser?.canReadOnlyServices ? "Enabled" : "Disabled"}
									</Badge>
								</div>
								{permissionContext.resourceType && (
									<div className="flex justify-between">
										<span className="text-muted-foreground">Resource Type:</span>
										<span className="text-xs font-medium">{permissionContext.resourceType}</span>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Contact Admin Information */}
				<Alert className="border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
					<AlertTriangle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
					<AlertDescription className="text-gray-800 dark:text-gray-200">
						<strong>Need Edit Access?</strong>
						<p className="text-sm mt-1">
							Contact your administrator to request edit permissions for this service.
						</p>
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	// If not read-only, show the children (action buttons)
	return <>{children}</>;
};

interface EnhancedReadOnlyIndicatorProps {
	serviceId: string;
	children: ReactNode;
	showTooltip?: boolean;
}

export const EnhancedReadOnlyIndicator = ({
	serviceId,
	children,
	showTooltip = true,
}: EnhancedReadOnlyIndicatorProps) => {
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
		<div className="relative group">
			{children}
			<div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
				<div className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
					<Lock className="h-3 w-3" />
					Read Only
				</div>
			</div>
			{showTooltip && (
				<div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
					You have read-only access to this service
				</div>
			)}
		</div>
	);
};

interface EnhancedReadOnlyFormWrapperProps {
	serviceId: string;
	children: ReactNode;
	showNotification?: boolean;
	allowedActions?: string[];
}

export const EnhancedReadOnlyFormWrapper = ({
	serviceId,
	children,
	showNotification = true,
	allowedActions = ["view", "logs", "eye", "view-button", "deployment-view"],
}: EnhancedReadOnlyFormWrapperProps) => {
	const { data: currentUser } = api.user.get.useQuery();

	// Check if user has read-only access to this service
	const isReadOnly =
		currentUser?.role === "member" &&
		currentUser?.canReadOnlyServices === true &&
		currentUser?.accessedServices?.includes(serviceId);

	// Event handler to prevent all interactions
	const preventAllInteractions = (e: React.SyntheticEvent) => {
		if (isReadOnly) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
	};

	// Get read-only props for form elements
	const getReadOnlyProps = (isReadOnly: boolean) => {
		if (!isReadOnly) return {};
		return {
			disabled: true,
			readOnly: true,
			onClick: preventAllInteractions,
			onChange: preventAllInteractions,
			onSubmit: preventAllInteractions,
			onKeyDown: preventAllInteractions,
			style: { cursor: "not-allowed", opacity: 0.6 },
		};
	};

	// Get read-only props for buttons
	const getReadOnlyButtonProps = (isReadOnly: boolean) => {
		if (!isReadOnly) return {};
		return {
			disabled: true,
			onClick: preventAllInteractions,
			style: { cursor: "not-allowed", opacity: 0.6 },
		};
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
				child.type?.displayName || child.type?.name || child.type;

			// Skip if already processed (prevent duplication) - only in read-only mode
			if (isReadOnly && child.props && child.props["data-readonly-processed"]) {
				return child;
			}

			// Check if this is a button or interactive element
			const isInteractiveElement = (
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
			);

			// Check if this is an allowed action in read-only mode
			const isAllowedAction = allowedActions.some(action => 
				child.props?.children?.toString().toLowerCase().includes(action.toLowerCase()) ||
				child.props?.["aria-label"]?.toLowerCase().includes(action.toLowerCase())
			);

			// Apply read-only behavior
			if (isInteractiveElement && !isAllowedAction) {
				return cloneElement(child, {
					...buttonProps,
					...child.props,
					...(isReadOnly && { "data-readonly-processed": true }),
				});
			}

			// Recursively process children
			if (child.props?.children) {
				return cloneElement(child, {
					...child.props,
					children: cloneChildren(child.props.children),
				});
			}

			return child;
		});
	};

	return (
		<div className="space-y-4">
			{showNotification && isReadOnly && (
				<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
					<Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
					<AlertDescription className="text-amber-800 dark:text-amber-200">
						<strong>Read-Only Mode:</strong> Form elements are disabled. You can view but not modify this service.
					</AlertDescription>
				</Alert>
			)}
			{cloneChildren(children)}
		</div>
	);
};

// Hook for enhanced read-only functionality
export const useEnhancedReadOnly = (serviceId: string) => {
	const { data: currentUser } = api.user.get.useQuery();

	const isReadOnly =
		currentUser?.role === "member" &&
		currentUser?.canReadOnlyServices === true &&
		currentUser?.accessedServices?.includes(serviceId);

	return {
		isReadOnly: !!isReadOnly,
		userRole: currentUser?.role,
		canReadOnlyServices: currentUser?.canReadOnlyServices,
		accessedServices: currentUser?.accessedServices,
		permissionDetails: {
			hasServiceAccess: currentUser?.accessedServices?.includes(serviceId) || false,
			isMember: currentUser?.role === "member",
			hasReadOnlyPermission: currentUser?.canReadOnlyServices || false,
		},
	};
};
