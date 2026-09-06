const DISMISSED_UPDATE_KEY = "dismissed_update";

const versionNumber = (version: string): number[] | null => {
	const match = version.replace(/^v/, "").split(".").map(Number);
	if (match.some((part) => Number.isNaN(part))) {
		return null;
	}
	return match;
};

const isNewerVersion = (candidate: string, dismissed: string): boolean => {
	const candidateParts = versionNumber(candidate);
	const dismissedParts = versionNumber(dismissed);

	if (!candidateParts || !dismissedParts) {
		return candidate !== dismissed;
	}

	const length = Math.max(candidateParts.length, dismissedParts.length);
	for (let i = 0; i < length; i++) {
		const a = candidateParts[i] ?? 0;
		const b = dismissedParts[i] ?? 0;
		if (a > b) {
			return true;
		}
		if (a < b) {
			return false;
		}
	}
	return false;
};

export const isUpdateDismissed = (latestVersion: string): boolean => {
	const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
	if (!dismissed) {
		return false;
	}

	return !isNewerVersion(latestVersion, dismissed);
};

export const dismissUpdate = (latestVersion: string): void => {
	localStorage.setItem(DISMISSED_UPDATE_KEY, latestVersion);
};
