import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { isMap, parseDocument } from "yaml";
import type { TraefikOptions } from "../../setup/traefik-setup";
import { writeFileRemote } from "../process/execAsync";
import { readConfigInPath } from "./application";

/** Prepare the listener and port bindings before recreating Traefik. */
export const prepareTraefikDashboard = async (
	enableDashboard: boolean,
	ports: NonNullable<TraefikOptions["additionalPorts"]>,
	serverId?: string,
) => {
	const { MAIN_TRAEFIK_PATH } = paths(!!serverId);
	const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
	const config = await readConfigInPath(configPath, serverId);
	if (!config) {
		throw new Error("Traefik configuration was not found.");
	}

	const document = parseDocument(config);
	const api = document.get("api");
	if (
		document.errors.length > 0 ||
		!isMap(document.contents) ||
		(api !== undefined && !isMap(api))
	) {
		throw new Error("Traefik configuration must contain valid YAML mappings.");
	}

	document.setIn(["api", "insecure"], enableDashboard);
	if (enableDashboard) {
		document.setIn(["api", "dashboard"], true);
	}
	const updatedConfig = document.toString();
	// A failed write must prevent publishing the dashboard port.
	if (serverId) {
		await writeFileRemote(serverId, configPath, updatedConfig);
	} else {
		writeFileSync(configPath, updatedConfig, "utf8");
	}

	const additionalPorts = ports.filter((port) => port.targetPort !== 8080);
	if (enableDashboard) {
		additionalPorts.push({
			targetPort: 8080,
			publishedPort: 8080,
			protocol: "tcp",
		});
	}
	return additionalPorts;
};
