import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsService,
	DefinitionsVolume,
} from "../types";

// Función para agregar prefijo a volúmenes
export const addSuffixToVolumesRoot = (
	volumes: { [key: string]: DefinitionsVolume },
	suffix: string,
): { [key: string]: DefinitionsVolume } => {
	return _.mapKeys(volumes, (_value, key) => `${key}-${suffix}`);
};

export const addSuffixToVolumesInServices = (
	services: { [key: string]: DefinitionsService },
	suffix: string,
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
						!volumeName ||
						volumeName.startsWith(".") ||
						volumeName.startsWith("/") ||
						volumeName.startsWith("$")
					) {
						return volume;
					}

					// Handle volume paths with subdirectories
					const parts = volumeName.split("/");
					if (parts.length > 1) {
						const baseName = parts[0];
						const rest = parts.slice(1).join("/");
						return `${baseName}-${suffix}/${rest}:${path}`;
					}

					return `${volumeName}-${suffix}:${path}`;
				}
				if (_.isObject(volume) && volume.type === "volume" && volume.source) {
					return {
						...volume,
						source: `${volume.source}-${suffix}`,
					};
				}
				return volume;
			});
		}

		newServices[serviceName] = newServiceConfig;
	});

	return newServices;
};

export const addSuffixToAllVolumes = (
	composeData: ComposeSpecification,
	suffix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (updatedComposeData.volumes) {
		updatedComposeData.volumes = addSuffixToVolumesRoot(
			updatedComposeData.volumes,
			suffix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addSuffixToVolumesInServices(
			updatedComposeData.services,
			suffix,
		);
	}

	return updatedComposeData;
};
