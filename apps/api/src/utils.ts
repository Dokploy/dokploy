import {
	deployApplication,
	deployCompose,
	deployRemoteApplication,
	deployRemoteCompose,
	rebuildApplication,
	rebuildCompose,
	rebuildRemoteApplication,
	rebuildRemoteCompose,
	updateApplicationStatus,
	updateCompose,
} from "@dokploy/builders";
import type { LemonSqueezyLicenseResponse } from "./types";
import type { DeployJob } from "./schema";

// const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
// const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;
// export const validateLemonSqueezyLicense = async (
// 	licenseKey: string,
// ): Promise<LemonSqueezyLicenseResponse> => {
// 	try {
// 		const response = await fetch(
// 			"https://api.lemonsqueezy.com/v1/licenses/validate",
// 			{
// 				method: "POST",
// 				headers: {
// 					"Content-Type": "application/json",
// 					"x-api-key": LEMON_SQUEEZY_API_KEY as string,
// 				},
// 				body: JSON.stringify({
// 					license_key: licenseKey,
// 					store_id: LEMON_SQUEEZY_STORE_ID as string,
// 				}),
// 			},
// 		);

// 		return response.json();
// 	} catch (error) {
// 		console.error("Error validating license:", error);
// 		return { valid: false, error: "Error validating license" };
// 	}
// };

export const deploy = async (job: DeployJob) => {
	try {
		if (job.applicationType === "application") {
			await updateApplicationStatus(job.applicationId, "running");
			if (job.server) {
				if (job.type === "redeploy") {
					await rebuildRemoteApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				} else if (job.type === "deploy") {
					await deployRemoteApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				}
			}
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "running",
			});

			if (job.server) {
				if (job.type === "redeploy") {
					await rebuildRemoteCompose({
						composeId: job.composeId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				} else if (job.type === "deploy") {
					await deployRemoteCompose({
						composeId: job.composeId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				}
			}
		}
	} catch (error) {
		console.log(error);
		if (job.applicationType === "application") {
			await updateApplicationStatus(job.applicationId, "error");
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "error",
			});
		}
	}

	return true;
};
