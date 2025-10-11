import { findComposeById } from "@dokploy/server/services/compose";
import { stringify } from "yaml";
import {
	addAppNameToAllServiceNames,
	addCustomNetworksToCompose,
} from "./collision/root-network";
import { generateRandomHash } from "./compose";
import { addSuffixToAllVolumes } from "./compose/volume";
import {
	cloneCompose,
	cloneComposeRemote,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "./domain";
import type { ComposeSpecification } from "./types";

// Re-export functions from collision/root-network
export { addCustomNetworksToCompose } from "./collision/root-network";

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

	return stringify(composeData);
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

export const generateFullComposePreview = async (
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

	let newComposeFile = composeData;

	// Add custom networks from customNetworkIds
	if (compose.customNetworkIds && compose.customNetworkIds.length > 0) {
		newComposeFile = await addCustomNetworksToCompose(
			newComposeFile,
			compose.customNetworkIds,
		);
	}

	return stringify(newComposeFile);
};
