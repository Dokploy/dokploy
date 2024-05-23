import type { ComposeSpecification } from "../types";

export const addPrefixToSecretsRoot = (
	secrets: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newSecrets: { [key: string]: any } = {};
	for (const [key, value] of Object.entries(secrets)) {
		const newKey = `${key}-${prefix}`;
		newSecrets[newKey] = value;
	}
	return newSecrets;
};

export const addPrefixToServiceSecrets = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.secrets) {
			const updatedSecrets = serviceValue.secrets.map((secret: any) => {
				if (typeof secret === "object" && secret.source) {
					return {
						...secret,
						source: `${secret.source}-${prefix}`,
					};
				}
				return secret;
			});
			newServices[serviceKey].secrets = updatedSecrets;
		}
	}
	return newServices;
};

export const addPrefixToAllSecrets = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedSecrets = addPrefixToSecretsRoot(
		composeData.secrets || {},
		prefix,
	);
	const updatedServices = addPrefixToServiceSecrets(
		composeData.services || {},
		prefix,
	);

	return {
		...composeData,
		secrets: updatedSecrets,
		services: updatedServices,
	};
};
