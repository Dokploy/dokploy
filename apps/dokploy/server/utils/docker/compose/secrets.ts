import _ from "lodash";
import type { ComposeSpecification, DefinitionsService } from "../types";

export const addPrefixToSecretsRoot = (
	secrets: ComposeSpecification["secrets"],
	prefix: string,
): ComposeSpecification["secrets"] => {
	const newSecrets: ComposeSpecification["secrets"] = {};
	_.forEach(secrets, (secretConfig, secretName) => {
		const newSecretName = `${secretName}-${prefix}`;
		newSecrets[newSecretName] = _.cloneDeep(secretConfig);
	});
	return newSecrets;
};

export const addPrefixToSecretsInServices = (
	services: { [key: string]: DefinitionsService },
	prefix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};

	_.forEach(services, (serviceConfig, serviceName) => {
		const newServiceConfig = _.cloneDeep(serviceConfig);

		// Replace secret names in secrets
		if (_.has(newServiceConfig, "secrets")) {
			newServiceConfig.secrets = _.map(newServiceConfig.secrets, (secret) => {
				if (_.isString(secret)) {
					return `${secret}-${prefix}`;
				}
				if (_.isObject(secret) && secret.source) {
					return {
						...secret,
						source: `${secret.source}-${prefix}`,
					};
				}
				return secret;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addPrefixToAllSecrets = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (composeData?.secrets) {
		updatedComposeData.secrets = addPrefixToSecretsRoot(
			composeData.secrets,
			prefix,
		);
	}

	if (composeData?.services) {
		updatedComposeData.services = addPrefixToSecretsInServices(
			composeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
