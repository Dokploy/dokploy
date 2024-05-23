import crypto from "node:crypto";
import type { ComposeSpecification, DefinitionsService } from "./types";
import { findComposeById } from "@/server/api/services/compose";
import { dump, load } from "js-yaml";

export const generateRandomHash = (): string => {
	return crypto.randomBytes(4).toString("hex");
};

export const generateServiceName = (
	baseName: string,
	index: number,
): string => {
	return `${baseName}_${index}`;
};

export const generateContainerName = (
	baseName: string,
	index: number,
): string => {
	return `${baseName}_container_${index}`;
};

export const generateNetworkName = (
	baseName: string,
	index: number,
): string => {
	return `${baseName}_${index}`;
};

export const addPrefixToNetworks = (
	networks: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newNetworks: { [key: string]: any } = {};
	for (const [key, value] of Object.entries(networks)) {
		const newKey = `${key}-${prefix}`;
		newNetworks[newKey] = value;
	}
	return newNetworks;
};

const addPrefixToServiceNames = (
	services: { [key: string]: DefinitionsService },
	prefix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};
	for (const [key, value] of Object.entries(services)) {
		const newKey = `${key}-${prefix}`;
		newServices[newKey] = value;
	}
	return newServices;
};

export const randomizeComposeFile = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (composeData?.services) {
		composeData.services = addPrefixToServiceNames(
			composeData.services,
			prefix,
		);
	}

	if (composeData?.networks) {
		composeData.networks = addPrefixToNetworks(composeData.networks, prefix);
	}

	// if (composeData?.volumes) {
	// 	composeData.volumes = addPrefixToVolumes(composeData.volumes, prefix);
	// }

	const newComposeFile = dump(composeData);

	return newComposeFile;
};
