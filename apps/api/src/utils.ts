import { LEMON_SQUEEZY_API_KEY, LEMON_SQUEEZY_STORE_ID } from ".";
import type { LemonSqueezyLicenseResponse } from "./types";

export const validateLemonSqueezyLicense = async (
	licenseKey: string,
): Promise<LemonSqueezyLicenseResponse> => {
	try {
		const response = await fetch(
			"https://api.lemonsqueezy.com/v1/licenses/validate",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": LEMON_SQUEEZY_API_KEY as string,
				},
				body: JSON.stringify({
					license_key: licenseKey,
					store_id: LEMON_SQUEEZY_STORE_ID as string,
				}),
			},
		);

		return response.json();
	} catch (error) {
		console.error("Error validating license:", error);
		return { valid: false, error: "Error validating license" };
	}
};
