import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsService,
	DefinitionsVolume,
} from "../types";

export type ServiceVolume = {
	serviceName: string;
	type: string;
	source: string;
	target: string;
};

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

export const extractServiceVolumes = (
	composeData: ComposeSpecification,
): ServiceVolume[] => {
	if (!composeData.services) {
		return [];
	}

	const result: ServiceVolume[] = [];

	_.forEach(composeData.services, (serviceConfig, serviceName) => {
		if (!serviceConfig.volumes) {
			return;
		}
		for (const vol of serviceConfig.volumes) {
			if (_.isString(vol)) {
				const parts = vol.split(":");
				const source = parts[0] || "";
				const target = parts[1] || "";
				const isBind =
					source.startsWith(".") ||
					source.startsWith("/") ||
					source.startsWith("$");
				result.push({
					serviceName,
					type: isBind ? "bind" : "volume",
					source,
					target,
				});
			} else {
				result.push({
					serviceName,
					type: vol.type,
					source: vol.source || "",
					target: vol.target || "",
				});
			}
		}
	});

	return result;
};

export const addVolumeToService = (
	composeData: ComposeSpecification,
	serviceName: string,
	volume: string,
): ComposeSpecification => {
	const updated = _.cloneDeep(composeData);
	if (!updated.services?.[serviceName]) {
		return updated;
	}
	if (!updated.services[serviceName].volumes) {
		updated.services[serviceName].volumes = [];
	}
	updated.services[serviceName].volumes.push(volume);
	return updated;
};

export const removeVolumeFromService = (
	composeData: ComposeSpecification,
	serviceName: string,
	target: string,
): ComposeSpecification => {
	const updated = _.cloneDeep(composeData);
	if (!updated.services?.[serviceName]?.volumes) {
		return updated;
	}
	updated.services[serviceName].volumes = updated.services[
		serviceName
	].volumes.filter((vol) => {
		if (_.isString(vol)) {
			const parts = vol.split(":");
			return parts[1] !== target;
		}
		return vol.target !== target;
	});
	return updated;
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
