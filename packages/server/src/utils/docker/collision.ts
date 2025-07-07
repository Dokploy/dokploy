import { findComposeById } from "@dokploy/server/services/compose";
import { dump, load } from "js-yaml";
import { addAppNameToAllServiceNames } from "./collision/root-network";
import { addSuffixToAllVolumes } from "./compose/volume";
import { generateRandomHash } from "./compose";
import type { ComposeSpecification } from "./types";

export const addAppNameToPreventCollision = (
	composeData: ComposeSpecification,
	appName: string,
	isolatedDeploymentsVolume: boolean,
): ComposeSpecification => {
	let updatedComposeData = { ...composeData };

	updatedComposeData = addAppNameToAllServiceNames(updatedComposeData, appName);
	if (isolatedDeploymentsVolume) {
		updatedComposeData = addSuffixToAllVolumes(updatedComposeData, appName);
	}
	return updatedComposeData;
};

export const randomizeIsolatedDeploymentComposeFile = async (
	composeId: string,
	suffix?: string,
) => {
	const compose = await findComposeById(composeId);
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	const randomSuffix = suffix || compose.appName || generateRandomHash();

	const newComposeFile = addAppNameToPreventCollision(
		composeData,
		randomSuffix,
		compose.isolatedDeploymentsVolume,
	);

	return dump(newComposeFile);
};

export const randomizeDeployableSpecificationFile = (
	composeSpec: ComposeSpecification,
	isolatedDeploymentsVolume: boolean,
	suffix?: string,
) => {
	if (!suffix) {
		return composeSpec;
	}
	const newComposeFile = addAppNameToPreventCollision(
		composeSpec,
		suffix,
		isolatedDeploymentsVolume,
	);
	return newComposeFile;
};
