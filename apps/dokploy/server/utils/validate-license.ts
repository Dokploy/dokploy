const licensesUrl = process.env.LICENSES_URL || "http://localhost:4002";

export const validateLicense = async (licenseKey: string, serverIp: string) => {
	const response = await fetch(`${licensesUrl}/api/license/validate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ licenseKey, serverIp }),
	});
	const data = await response.json();

	if (!response.ok && data.error?.issues) {
		console.log("Validation errors:", data.error.issues);
	}

	return data;
};

export const activateLicense = async (licenseKey: string, serverIp: string) => {
	const response = await fetch(`${licensesUrl}/api/license/activate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ licenseKey, serverIp }),
	});
	const data = await response.json();

	return data;
};

export const deactivateLicense = async (
	licenseKey: string,
	serverIp: string,
) => {
	const response = await fetch(`${licensesUrl}/api/license/deactivate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ licenseKey, serverIp }),
	});
	const data = await response.json();

	return data;
};
