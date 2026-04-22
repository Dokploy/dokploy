import { getPublicIpWithFallback, LICENSE_KEY_URL } from "@dokploy/server";

const LICENSE_SERVER_UNREACHABLE =
	"Could not reach the license server. Check your connection or try again later.";

function isNetworkError(error: unknown): boolean {
	if (error instanceof Error) {
		if (error.message === "fetch failed") return true;
		const cause = (error as Error & { cause?: { code?: string } }).cause;
		const code = cause?.code;
		return (
			code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT"
		);
	}
	return false;
}

export const validateLicenseKey = async (licenseKey: string) => {
	try {
		const ip = await getPublicIpWithFallback();
		const result = await fetch(`${LICENSE_KEY_URL}/licenses/validate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ licenseKey, ip }),
		});

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || "Failed to validate license key");
		}

		const data = await result.json();
		return data.valid;
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Failed to validate license key",
		);
		if (isNetworkError(error)) {
			throw new Error(LICENSE_SERVER_UNREACHABLE);
		}
		throw error;
	}
};

export const activateLicenseKey = async (licenseKey: string) => {
	try {
		const ip = await getPublicIpWithFallback();
		const result = await fetch(`${LICENSE_KEY_URL}/licenses/activate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ licenseKey, ip }),
		});

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || "Failed to activate license key");
		}

		const data = await result.json();
		return data;
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Failed to activate license key",
		);
		if (isNetworkError(error)) {
			throw new Error(LICENSE_SERVER_UNREACHABLE);
		}
		throw error;
	}
};

export const deactivateLicenseKey = async (licenseKey: string) => {
	try {
		const ip = await getPublicIpWithFallback();
		const result = await fetch(`${LICENSE_KEY_URL}/licenses/deactivate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ licenseKey, ip }),
		});

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || "Failed to deactivate license key");
		}

		const data = await result.json();
		return data;
	} catch (error) {
		console.error(
			error instanceof Error
				? error.message
				: "Failed to deactivate license key",
		);
		if (isNetworkError(error)) {
			throw new Error(LICENSE_SERVER_UNREACHABLE);
		}
		throw error;
	}
};
