import { findComposeById } from "@dokploy/server/services/compose";
import { dump, load } from "js-yaml";
import { addAppNameToAllServiceNames } from "./collision/root-network";
import { generateRandomHash } from "./compose";
import { addSuffixToAllVolumes } from "./compose/volume";
import type { ComposeSpecification } from "./types";

export const addAppNameToPreventCollision = (
	composeData: ComposeSpecification,
	appName: string,
): ComposeSpecification => {
	let updatedComposeData = { ...composeData };

	updatedComposeData = addAppNameToAllServiceNames(updatedComposeData, appName);
	updatedComposeData = addSuffixToAllVolumes(updatedComposeData, appName);
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
	);

	return dump(newComposeFile);
};

export const randomizeDeployableSpecificationFile = (
	composeSpec: ComposeSpecification,
	suffix?: string,
) => {
	if (!suffix) {
		return composeSpec;
	}
	const newComposeFile = addAppNameToPreventCollision(composeSpec, suffix);
	return newComposeFile;
};
