import crypto from "node:crypto";
import type { ComposeSpecification, DefinitionsService } from "./types";
import { findComposeById } from "@/server/api/services/compose";
import { dump, load } from "js-yaml";
import {
	addPrefixToAllVolumes,
	addPrefixToServiceObjectVolumes,
	addPrefixToServiceVolumes,
	addPrefixToVolumesRoot,
} from "./compose/volume";
import {
	addPrefixToAllConfigs,
	addPrefixToConfigsRoot,
	addPrefixToServiceConfigs,
} from "./compose/configs";
import {
	addPrefixToAllNetworks,
	addPrefixToNetworksRoot,
	addPrefixToServiceNetworks,
} from "./compose/network";
import {
	addPrefixToAllSecrets,
	addPrefixToSecretsRoot,
	addPrefixToServiceSecrets,
} from "./compose/secrets";
import {
	addPrefixToAllServiceNames,
	addPrefixToContainerNames,
} from "./compose/service";

export const generateRandomHash = (): string => {
	return crypto.randomBytes(4).toString("hex");
};

export const randomizeComposeFile = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	// if (composeData?.volumes) {
	// 	composeData.volumes = addPrefixToVolumes(composeData.volumes, prefix);
	// }

	const newComposeFile = dump(composeData);

	return newComposeFile;
};

export const addPrefixToAllProperties = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedVolumes = addPrefixToAllVolumes(
		composeData || {},
		prefix,
	).volumes;
	const updatedNetworks = addPrefixToAllNetworks(
		composeData || {},
		prefix,
	).networks;
	const updatedConfigs = addPrefixToAllConfigs(
		composeData || {},
		prefix,
	).configs;
	const updatedSecrets = addPrefixToAllSecrets(
		composeData || {},
		prefix,
	).secrets;

	const updatedServices = addPrefixToAllServiceNames(
		composeData,
		prefix,
	).services;

	return {
		...composeData,
		volumes: updatedVolumes,
		networks: updatedNetworks,
		configs: updatedConfigs,
		secrets: updatedSecrets,
		services: updatedServices,
	};
};
