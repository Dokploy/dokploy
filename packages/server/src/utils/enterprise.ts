import { getPublicIpWithFallback } from "@dokploy/server/wss/utils";

export const LICENSE_KEY_URL = "https://licenses-api.dokploy.com";

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

type LicenseAction = "validate" | "activate" | "deactivate";

const requestLicenseServer = async (
	action: LicenseAction,
	licenseKey: string,
) => {
	const errorMessage = `Failed to ${action} license key`;
	try {
		const ip = await getPublicIpWithFallback();
		const result = await fetch(`${LICENSE_KEY_URL}/licenses/${action}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ licenseKey, ip }),
		});

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || errorMessage);
		}

		return await result.json();
	} catch (error) {
		console.error(error instanceof Error ? error.message : errorMessage);
		if (isNetworkError(error)) {
			throw new Error(LICENSE_SERVER_UNREACHABLE);
		}
		throw error;
	}
};

export const validateLicenseKey = async (licenseKey: string) => {
	const data = await requestLicenseServer("validate", licenseKey);
	return data.valid;
};

export const activateLicenseKey = async (licenseKey: string) => {
	return await requestLicenseServer("activate", licenseKey);
};

export const deactivateLicenseKey = async (licenseKey: string) => {
	return await requestLicenseServer("deactivate", licenseKey);
};
