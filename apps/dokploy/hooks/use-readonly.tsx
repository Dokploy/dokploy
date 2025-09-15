import { api } from "@/utils/api";

interface UseReadOnlyOptions {
	serviceId: string;
	serviceType?: string;
}

export const useReadOnly = ({ serviceId, serviceType }: UseReadOnlyOptions) => {
	const { data: currentUser } = api.user.get.useQuery();
	
	// Check if user has read-only access to this service
	const isReadOnly = currentUser?.role === "member" && 
		currentUser?.canReadOnlyServices === true && 
		currentUser?.accessedServices?.includes(serviceId);
	
	// Debug logging (remove in production)
	if (process.env.NODE_ENV === 'development') {
		console.log('useReadOnly Debug:', {
			serviceId,
			serviceType,
			userRole: currentUser?.role,
			canReadOnlyServices: currentUser?.canReadOnlyServices,
			accessedServices: currentUser?.accessedServices,
			isReadOnly
		});
	}
	
	return {
		isReadOnly: !!isReadOnly,
		userRole: currentUser?.role,
		canReadOnlyServices: currentUser?.canReadOnlyServices,
		accessedServices: currentUser?.accessedServices,
	};
};

// Hook to disable specific actions in read-only mode
export const useReadOnlyAction = (serviceId: string, action: string) => {
	const { isReadOnly } = useReadOnly({ serviceId });
	
	const executeAction = (callback: () => void) => {
		if (isReadOnly) {
			console.warn(`Action "${action}" is disabled in read-only mode for service ${serviceId}`);
			return;
		}
		callback();
	};
	
	const executeAsyncAction = async (callback: () => Promise<void>) => {
		if (isReadOnly) {
			console.warn(`Async action "${action}" is disabled in read-only mode for service ${serviceId}`);
			return;
		}
		await callback();
	};
	
	return {
		isReadOnly,
		executeAction,
		executeAsyncAction,
		disabled: isReadOnly,
	};
};

// Helper function to disable all interactions
export const getReadOnlyProps = (isReadOnly: boolean) => {
	if (!isReadOnly) {
		return {};
	}
	
	return {
		disabled: true,
		readOnly: true,
		className: "opacity-50 pointer-events-none cursor-not-allowed",
		onClick: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onChange: (e: React.ChangeEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onSubmit: (e: React.FormEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onKeyDown: (e: React.KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onKeyUp: (e: React.KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onFocus: (e: React.FocusEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onBlur: (e: React.FocusEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onMouseDown: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onMouseUp: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onTouchStart: (e: React.TouchEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onTouchEnd: (e: React.TouchEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
	};
};

// Helper function to disable button interactions
export const getReadOnlyButtonProps = (isReadOnly: boolean) => {
	if (!isReadOnly) {
		return {};
	}
	
	return {
		disabled: true,
		className: "opacity-50 pointer-events-none cursor-not-allowed",
		onClick: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onKeyDown: (e: React.KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onMouseDown: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
		onTouchStart: (e: React.TouchEvent) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		},
	};
};
