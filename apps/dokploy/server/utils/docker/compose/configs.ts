import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsConfig,
	DefinitionsService,
} from "../types";

export const addSuffixToConfigsRoot = (
	configs: { [key: string]: DefinitionsConfig },
	suffix: string,
): { [key: string]: DefinitionsConfig } => {
	const newConfigs: { [key: string]: DefinitionsConfig } = {};

	_.forEach(configs, (config, configName) => {
		const newConfigName = `${configName}-${suffix}`;
		newConfigs[newConfigName] = _.cloneDeep(config);
	});

	return newConfigs;
};

export const addSuffixToConfigsInServices = (
	services: { [key: string]: DefinitionsService },
	suffix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};

	_.forEach(services, (serviceConfig, serviceName) => {
		const newServiceConfig = _.cloneDeep(serviceConfig);

		// Reemplazar nombres de configs en configs
		if (_.has(newServiceConfig, "configs")) {
			newServiceConfig.configs = _.map(newServiceConfig.configs, (config) => {
				if (_.isString(config)) {
					return `${config}-${suffix}`;
				}
				if (_.isObject(config) && config.source) {
					return {
						...config,
						source: `${config.source}-${suffix}`,
					};
				}
				return config;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addSuffixToAllConfigs = (
	composeData: ComposeSpecification,
	suffix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };
	if (composeData?.configs) {
		updatedComposeData.configs = addSuffixToConfigsRoot(
			composeData.configs,
			suffix,
		);
	}

	if (composeData?.services) {
		updatedComposeData.services = addSuffixToConfigsInServices(
			composeData.services,
			suffix,
		);
	}

	return updatedComposeData;
};
