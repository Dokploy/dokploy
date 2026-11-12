import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import type { ApplicationNested } from "../builders";
import { isImageFromRegistry } from "./registry-host";

export type AuthConfig = {
	password: string;
	username: string;
	serveraddress: string;
};

/**
 * Resolve the registry credentials for an application.
 *
 * Both the Swarm service and the initial `docker pull` must authenticate the
 * same way, so this lives apart from the build commands.
 */
export const getAuthConfig = async (
	application: ApplicationNested,
): Promise<AuthConfig | undefined> => {
	const {
		registry,
		buildRegistry,
		username,
		password,
		sourceType,
		registryUrl,
		dockerImage,
	} = application;

	if (sourceType === "docker") {
		if (username && password) {
			return { password, username, serveraddress: registryUrl || "" };
		}

		// Docker-source apps can reuse the globally configured registry when
		// they have no credentials of their own. Only do that when the image
		// explicitly targets that registry: bare image names resolve to Docker
		// Hub and must not receive private registry credentials.
		const fallbackRegistry = registry ?? buildRegistry;
		if (
			!username &&
			!password &&
			fallbackRegistry &&
			isImageFromRegistry(dockerImage, fallbackRegistry.registryUrl)
		) {
			const r = await findRegistryByIdWithCredentials(
				fallbackRegistry.registryId,
			);
			return {
				password: r.password,
				username: r.username,
				serveraddress: r.registryUrl,
			};
		}
	} else if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	} else if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	}

	return undefined;
};
