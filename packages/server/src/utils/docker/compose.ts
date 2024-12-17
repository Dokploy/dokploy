import crypto from "node:crypto";
import { findComposeById } from "@dokploy/server/services/compose";
import { dump, load } from "js-yaml";
import { addSuffixToAllConfigs } from "./compose/configs";
import { addSuffixToAllNetworks } from "./compose/network";
import { addSuffixToAllSecrets } from "./compose/secrets";
import { addSuffixToAllServiceNames } from "./compose/service";
import { addSuffixToAllVolumes } from "./compose/volume";
import type { ComposeSpecification } from "./types";

export const generateRandomHash = (): string => {
	return crypto.randomBytes(4).toString("hex");
};

export const randomizeComposeFile = async (
	composeId: string,
	suffix?: string,
) => {
	const compose = await findComposeById(composeId);
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	const randomSuffix = suffix || generateRandomHash();

	const newComposeFile = addSuffixToAllProperties(composeData, randomSuffix);

	return dump(newComposeFile);
};

export const randomizeSpecificationFile = (
	composeSpec: ComposeSpecification,
	suffix?: string,
) => {
	if (!suffix) {
		return composeSpec;
	}
	const newComposeFile = addSuffixToAllProperties(composeSpec, suffix);
	return newComposeFile;
};

export const addSuffixToAllProperties = (
	composeData: ComposeSpecification,
	suffix: string,
): ComposeSpecification => {
	let updatedComposeData = { ...composeData };

	updatedComposeData = addSuffixToAllServiceNames(updatedComposeData, suffix);

	updatedComposeData = addSuffixToAllVolumes(updatedComposeData, suffix);

	updatedComposeData = addSuffixToAllNetworks(updatedComposeData, suffix);
	updatedComposeData = addSuffixToAllConfigs(updatedComposeData, suffix);

	updatedComposeData = addSuffixToAllSecrets(updatedComposeData, suffix);
	return updatedComposeData;
};
