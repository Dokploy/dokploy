import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { execAsync, execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

export interface GitInfo {
	gitHash: string;
	gitMessage: string;
}

export interface GitInfoExtractionParams {
	appName: string;
	serverId?: string | null;
	env?: string | null;
}

export interface GitInfoExtractionResult {
	gitInfo: GitInfo;
	updatedEnv: string;
}

/**
 * Extracts git commit information and updates environment variables
 * Works for both applications and compose services, local and remote execution
 */
export const extractGitInfo = async (
	params: GitInfoExtractionParams,
): Promise<GitInfoExtractionResult | null> => {
	const { appName, serverId, env } = params;

	try {
		// Determine if we should use remote or local execution
		const isRemote = !!serverId;
		const { APPLICATIONS_PATH, COMPOSE_PATH } = paths(isRemote);
		
		// Try both application and compose paths to find the git repository
		const possiblePaths = [
			join(APPLICATIONS_PATH, appName, "code"),
			join(COMPOSE_PATH, appName, "code"),
		];

		let gitHash = "";
		let gitMessage = "";

		// Try to find the git repository in either path
		for (const codePath of possiblePaths) {
			try {
				if (isRemote) {
					const { stdout: hashStdout } = await execAsyncRemote(
						serverId!,
						`git -C ${codePath} rev-parse HEAD | tr -d '\n'`,
					);
					const { stdout: msgStdout } = await execAsyncRemote(
						serverId!,
						`git -C ${codePath} log -1 --pretty=%B`,
					);
					gitHash = (hashStdout || "").trim();
					gitMessage = (msgStdout || "").trim();
				} else {
					const { stdout: hashStdout } = await execAsync(
						`git -C ${codePath} rev-parse HEAD`,
					);
					const { stdout: msgStdout } = await execAsync(
						`git -C ${codePath} log -1 --pretty=%B`,
					);
					gitHash = hashStdout.trim();
					gitMessage = msgStdout.trim();
				}

				// If we got a valid hash, we found the right path
				if (gitHash) {
					break;
				}
			} catch (error) {
				// Continue to next path if this one fails
				continue;
			}
		}

		// If no git info found, return null
		if (!gitHash) {
			return null;
		}

		// Update environment variables
		const current = env || "";
		const withoutOld = current
			.split("\n")
			.filter((l) => l.trim() && !l.startsWith("GIT_HASH="))
			.join("\n");
		const updatedEnv = `${withoutOld}${withoutOld ? "\n" : ""}GIT_HASH=${gitHash}`;

		return {
			gitInfo: {
				gitHash,
				gitMessage,
			},
			updatedEnv,
		};
	} catch (error) {
		// Return null if git data can't be fetched
		return null;
	}
};
