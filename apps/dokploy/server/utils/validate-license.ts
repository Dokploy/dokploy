const licensesUrl = process.env.LICENSES_URL || "http://localhost:4002";

export const validateLicense = async (
	licenseKey: string,
	serverIp: string,
): Promise<boolean> => {
	const response = await fetch(`${licensesUrl}/api/validate`, {
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

	return response.ok;
};
