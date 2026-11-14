import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import { quote } from "shell-quote";
import type { ContentStaging } from "../filesystem/write-content";

export const getCreateComposeFileCommand = async (
	compose: Compose,
	staging: ContentStaging,
) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const { appName, composeFile } = compose;
	const outputPath = join(COMPOSE_PATH, appName, "code");
	const filePath = join(outputPath, "docker-compose.yml");
	const stagedPath = await staging.stage(composeFile);
	const bashCommand = `
		rm -rf ${quote([outputPath])} || exit 1;
		mkdir -p ${quote([outputPath])} || exit 1;
		cat ${quote([stagedPath])} > ${quote([filePath])} || exit 1;
		echo "File 'docker-compose.yml' created: ✅";
	`;
	return bashCommand;
};
