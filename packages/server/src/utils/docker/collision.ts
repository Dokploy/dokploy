import { findComposeById } from "@dokploy/server/services/compose";
import { dump } from "js-yaml";
import { addAppNameToAllServiceNames } from "./collision/root-network";
import { generateRandomHash } from "./compose";
import { addSuffixToAllVolumes } from "./compose/volume";
import {
	cloneCompose,
	cloneComposeRemote,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "./domain";
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

	if (compose.serverId) {
		await cloneComposeRemote(compose);
	} else {
		await cloneCompose(compose);
	}

	let composeData: ComposeSpecification | null;

	if (compose.serverId) {
		composeData = await loadDockerComposeRemote(compose);
	} else {
		composeData = await loadDockerCompose(compose);
	}

	if (!composeData) {
		throw new Error("Compose data not found");
	}

	const randomSuffix = suffix || compose.appName || generateRandomHash();

	const newComposeFile = compose.isolatedDeployment
		? addAppNameToPreventCollision(
				composeData,
				randomSuffix,
				compose.isolatedDeploymentsVolume,
			)
		: composeData;

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
