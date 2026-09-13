export const DISMISSED_UPDATE_KEY = "dismissedUpdateVersion";

/**
 * Checks if a specific version update has been dismissed by the user.
 * If a newer version is released, it will not match the dismissed version,
 * allowing the user to be notified about subsequent updates.
 */
export const isUpdateDismissed = (
	version: string | null | undefined,
): boolean => {
	if (!version) return false;
	if (typeof localStorage === "undefined") return false;
	try {
		return localStorage.getItem(DISMISSED_UPDATE_KEY) === version;
	} catch {
		return false;
	}
};

/**
 * Saves a version string to localStorage so that the update notification
 * for this specific version is hidden.
 */
export const dismissUpdateVersion = (version: string): void => {
	if (!version || typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(DISMISSED_UPDATE_KEY, version);
	} catch {}
};

/**
 * Clears the dismissed update version from localStorage, restoring notifications.
 */
export const clearDismissedUpdateVersion = (): void => {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.removeItem(DISMISSED_UPDATE_KEY);
	} catch {}
};

/**
 * Determines whether the update banner or button should be visible based on
 * update availability, latest version, and dismissal status.
 */
export const shouldShowUpdate = (
	updateAvailable: boolean,
	latestVersion: string | null | undefined,
): boolean => {
	if (!updateAvailable || !latestVersion) {
		return false;
	}
	return !isUpdateDismissed(latestVersion);
};
