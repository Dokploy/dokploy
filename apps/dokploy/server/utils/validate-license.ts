export const validateLicense = async (licenseKey: string): Promise<boolean> => {
	const response = await fetch(`${process.env.SERVER_URL}/validate-license`, {
		method: "POST",
		body: JSON.stringify({ licenseKey }),
	});

	return response.ok;
};
