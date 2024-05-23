import type { ComposeSpecification } from "../types";

export const addPrefixToConfigsRoot = (
	configs: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newConfigs: { [key: string]: any } = {};
	for (const [key, value] of Object.entries(configs)) {
		const newKey = `${key}-${prefix}`;
		newConfigs[newKey] = value;
	}
	return newConfigs;
};

export const addPrefixToServiceConfigs = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.configs) {
			const updatedConfigs = serviceValue.configs.map((config: any) => {
				if (typeof config === "object" && config.source) {
					return {
						...config,
						source: `${config.source}-${prefix}`,
					};
				}
				return config;
			});
			newServices[serviceKey].configs = updatedConfigs;
		}
	}
	return newServices;
};

export const addPrefixToAllConfigs = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedConfigs = addPrefixToConfigsRoot(
		composeData.configs || {},
		prefix,
	);
	const updatedServices = addPrefixToServiceConfigs(
		composeData.services || {},
		prefix,
	);

	return {
		...composeData,
		configs: updatedConfigs,
		services: updatedServices,
	};
};
