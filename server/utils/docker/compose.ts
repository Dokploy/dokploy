import crypto from "node:crypto";
import type { ComposeSpecification } from "./types";
import { findComposeById } from "@/server/api/services/compose";
import { dump, load } from "js-yaml";
import { addPrefixToAllVolumes } from "./compose/volume";
import { addPrefixToAllConfigs } from "./compose/configs";
import { addPrefixToAllNetworks } from "./compose/network";
import { addPrefixToAllSecrets } from "./compose/secrets";
import { addPrefixToAllServiceNames } from "./compose/service";

export const generateRandomHash = (): string => {
	return crypto.randomBytes(4).toString("hex");
};

export const randomizeComposeFile = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	const composeFile = compose.composeFile;
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	const newComposeFile = addPrefixToAllProperties(composeData, prefix);

	return dump(newComposeFile);
};

export const addPrefixToAllProperties = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	let updatedComposeData = { ...composeData };

	updatedComposeData = addPrefixToAllServiceNames(updatedComposeData, prefix);

	updatedComposeData = addPrefixToAllVolumes(updatedComposeData, prefix);

	updatedComposeData = addPrefixToAllNetworks(updatedComposeData, prefix);
	updatedComposeData = addPrefixToAllConfigs(updatedComposeData, prefix);

	updatedComposeData = addPrefixToAllSecrets(updatedComposeData, prefix);
	return updatedComposeData;
};
