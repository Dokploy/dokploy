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
	// Enterprise features are freely available - always return valid
	console.log("License validation bypassed - all enterprise features are free");
	return true;
};

export const activateLicenseKey = async (licenseKey: string) => {
	// Enterprise features are freely available - activation always succeeds
	console.log("License activation bypassed - all enterprise features are free");
	return { success: true };
};

export const deactivateLicenseKey = async (licenseKey: string) => {
	// Enterprise features are freely available - deactivation always succeeds
	console.log("License deactivation bypassed - all enterprise features are free");
	return { success: true };
};
