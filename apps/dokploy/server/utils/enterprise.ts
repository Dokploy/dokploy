import { getPublicIpWithFallback, LICENSE_KEY_URL } from "@dokploy/server";

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
		throw error;
	}
};
