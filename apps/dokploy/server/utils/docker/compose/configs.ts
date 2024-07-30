import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsConfig,
	DefinitionsService,
} from "../types";

export const addPrefixToConfigsRoot = (
	configs: { [key: string]: DefinitionsConfig },
	prefix: string,
): { [key: string]: DefinitionsConfig } => {
	const newConfigs: { [key: string]: DefinitionsConfig } = {};

	_.forEach(configs, (config, configName) => {
		const newConfigName = `${configName}-${prefix}`;
		newConfigs[newConfigName] = _.cloneDeep(config);
	});

	return newConfigs;
};

export const addPrefixToConfigsInServices = (
	services: { [key: string]: DefinitionsService },
	prefix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};

	_.forEach(services, (serviceConfig, serviceName) => {
		const newServiceConfig = _.cloneDeep(serviceConfig);

		// Reemplazar nombres de configs en configs
		if (_.has(newServiceConfig, "configs")) {
			newServiceConfig.configs = _.map(newServiceConfig.configs, (config) => {
				if (_.isString(config)) {
					return `${config}-${prefix}`;
				}
				if (_.isObject(config) && config.source) {
					return {
						...config,
						source: `${config.source}-${prefix}`,
					};
				}
				return config;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addPrefixToAllConfigs = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };
	if (composeData?.configs) {
		updatedComposeData.configs = addPrefixToConfigsRoot(
			composeData.configs,
			prefix,
		);
	}

	if (composeData?.services) {
		updatedComposeData.services = addPrefixToConfigsInServices(
			composeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
