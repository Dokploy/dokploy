import _ from "lodash";
import type { ComposeSpecification, DefinitionsService } from "../types";

export const addSuffixToSecretsRoot = (
	secrets: ComposeSpecification["secrets"],
	suffix: string,
): ComposeSpecification["secrets"] => {
	const newSecrets: ComposeSpecification["secrets"] = {};
	_.forEach(secrets, (secretConfig, secretName) => {
		const newSecretName = `${secretName}-${suffix}`;
		newSecrets[newSecretName] = _.cloneDeep(secretConfig);
	});
	return newSecrets;
};

export const addSuffixToSecretsInServices = (
	services: { [key: string]: DefinitionsService },
	suffix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};

	_.forEach(services, (serviceConfig, serviceName) => {
		const newServiceConfig = _.cloneDeep(serviceConfig);

		// Replace secret names in secrets
		if (_.has(newServiceConfig, "secrets")) {
			newServiceConfig.secrets = _.map(newServiceConfig.secrets, (secret) => {
				if (_.isString(secret)) {
					return `${secret}-${suffix}`;
				}
				if (_.isObject(secret) && secret.source) {
					return {
						...secret,
						source: `${secret.source}-${suffix}`,
					};
				}
				return secret;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addSuffixToAllSecrets = (
	composeData: ComposeSpecification,
	suffix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (composeData?.secrets) {
		updatedComposeData.secrets = addSuffixToSecretsRoot(
			composeData.secrets,
			suffix,
		);
	}

	if (composeData?.services) {
		updatedComposeData.services = addSuffixToSecretsInServices(
			composeData.services,
			suffix,
		);
	}

	return updatedComposeData;
};
