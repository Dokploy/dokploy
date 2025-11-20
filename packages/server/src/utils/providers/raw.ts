import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import { encodeBase64 } from "../docker/utils";

export const getCreateComposeFileCommand = (compose: Compose) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { appName, composeFile } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");
	const encodedContent = encodeBase64(composeFile);
	const bashCommand = `
		rm -rf ${outputPath};
		mkdir -p ${outputPath};
		echo "${encodedContent}" | base64 -d > "${filePath}";
		echo "File 'docker-compose.yml' created: ✅";
	`;
	return bashCommand;
};
