import type { ComposeSpecification } from "../types";

// Función para agregar prefijo a volúmenes
export const addPrefixToVolumesRoot = (
	volumes: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newVolumes: { [key: string]: any } = {};
	for (const [key, value] of Object.entries(volumes)) {
		const newKey = `${key}-${prefix}`;
		newVolumes[newKey] = value;
	}
	return newVolumes;
};

export const addPrefixToServiceVolumes = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.volumes) {
			const updatedVolumes = serviceValue.volumes.map((volume: any) => {
				if (typeof volume === "string") {
					const parts = volume.split(":");
					if (
						parts.length > 1 &&
						!parts[0].startsWith("./") &&
						!parts[0].startsWith("${")
					) {
						parts[0] = `${parts[0]}-${prefix}`;
					}
					return parts.join(":");
				}
				return volume;
			});
			newServices[serviceKey].volumes = updatedVolumes;
		}
	}
	return newServices;
};

export const addPrefixToServiceObjectVolumes = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.volumes) {
			const updatedVolumes = serviceValue.volumes.map((volume: any) => {
				if (typeof volume === "object" && volume.type === "volume") {
					return {
						...volume,
						source: `${volume.source}-${prefix}`,
					};
				}
				return volume;
			});
			newServices[serviceKey].volumes = updatedVolumes;
		}
	}
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
		updatedComposeData.services = addPrefixToServiceVolumes(
			updatedComposeData.services,
			prefix,
		);
		updatedComposeData.services = addPrefixToServiceObjectVolumes(
			updatedComposeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
