import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsService,
	DefinitionsVolume,
} from "../types";

// Función para agregar prefijo a volúmenes
export const addPrefixToVolumesRoot = (
	volumes: { [key: string]: DefinitionsVolume },
	prefix: string,
): { [key: string]: DefinitionsVolume } => {
	return _.mapKeys(volumes, (_value, key) => `${key}-${prefix}`);
};

export const addPrefixToVolumesInServices = (
	services: { [key: string]: DefinitionsService },
	prefix: string,
): { [key: string]: DefinitionsService } => {
	const newServices: { [key: string]: DefinitionsService } = {};

	_.forEach(services, (serviceConfig, serviceName) => {
		const newServiceConfig = _.cloneDeep(serviceConfig);

		// Reemplazar nombres de volúmenes en volumes
		if (_.has(newServiceConfig, "volumes")) {
			newServiceConfig.volumes = _.map(newServiceConfig.volumes, (volume) => {
				if (_.isString(volume)) {
					const [volumeName, path] = volume.split(":");

					// skip bind mounts and variables (e.g. $PWD)
					if (
						volumeName?.startsWith(".") ||
						volumeName?.startsWith("/") ||
						volumeName?.startsWith("$")
					) {
						return volume;
					}
					return `${volumeName}-${prefix}:${path}`;
				}
				if (_.isObject(volume) && volume.type === "volume" && volume.source) {
					return {
						...volume,
						source: `${volume.source}-${prefix}`,
					};
				}
				return volume;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addPrefixToAllVolumes = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (updatedComposeData.volumes) {
		updatedComposeData.volumes = addPrefixToVolumesRoot(
			updatedComposeData.volumes,
			prefix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addPrefixToVolumesInServices(
			updatedComposeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
