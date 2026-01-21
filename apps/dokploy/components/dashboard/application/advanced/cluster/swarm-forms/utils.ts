/**
 * Filters out undefined, null, and empty string values from form data
 * Only returns fields that have actual values
 */
export const filterEmptyValues = (
	formData: Record<string, any>,
): Record<string, any> => {
	return Object.entries(formData).reduce(
		(acc, [key, value]) => {
			// Keep arrays even if empty (they might be intentionally cleared)
			if (Array.isArray(value)) {
				if (value.length > 0) {
					acc[key] = value;
				}
			}
			// For other values, filter out undefined, null, and empty strings
			else if (value !== undefined && value !== null && value !== "") {
				acc[key] = value;
			}
			return acc;
		},
		{} as Record<string, any>,
	);
};

/**
 * Checks if filtered data has any values to save
 */
export const hasValues = (data: Record<string, any>): boolean => {
	return Object.keys(data).length > 0;
};
