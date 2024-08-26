import { findAdmin } from "./admin";

export const isValidLicense = async () => {
	const admin = await findAdmin();

	const result = await fetch("http://127.0.0.1:4000/v1/validate-license", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			licenseKey: admin.licenseKey,
		}),
	});

	const data = await result.json();
	return data.valid;
};
