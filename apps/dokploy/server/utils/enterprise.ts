import { getPublicIpWithFallback } from "@dokploy/server/index";

const LICENSE_KEY_URL = process.env.LICENSE_KEY_URL || "http://localhost:4002";

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
		console.log("data", data);
		return data.valid;
	} catch (error) {
		console.error(error);
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
		console.error(error);
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
		console.error(error);
		throw error;
	}
};
