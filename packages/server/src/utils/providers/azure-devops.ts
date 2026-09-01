import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { apiFindAzureDevopsBranches } from "@dokploy/server/db/schema";
import {
	type AzureDevops,
	findAzureDevopsById,
} from "@dokploy/server/services/azure-devops";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
import type { z } from "zod";

export const getAzureDevopsHeaders = (provider: AzureDevops) => ({
	Authorization: `Basic ${Buffer.from(`:${provider.personalAccessToken}`).toString("base64")}`,
	Accept: "application/json",
});

const azureApi = (organizationName: string, path: string) =>
	`https://dev.azure.com/${encodeURIComponent(organizationName)}/${path}`;

const fetchAzure = async <T>(
	provider: AzureDevops,
	path: string,
): Promise<T> => {
	const response = await fetch(azureApi(provider.organizationName, path), {
		headers: getAzureDevopsHeaders(provider),
	});
	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Azure DevOps request failed (${response.status} ${response.statusText})`,
		});
	}
	return (await response.json()) as T;
};

export const getAzureDevopsRepositories = async (azureDevopsId: string) => {
	const provider = await findAzureDevopsById(azureDevopsId);
	const data = await fetchAzure<{
		value: Array<{
			id: string;
			name: string;
			remoteUrl: string;
			webUrl?: string;
			defaultBranch?: string;
			project: { id: string; name: string };
		}>;
	}>(provider, "_apis/git/repositories?includeAllUrls=true&api-version=7.1");
	return data.value
		.filter((repo) => repo.remoteUrl)
		.map((repo) => ({
			id: repo.id,
			name: repo.name,
			url: repo.webUrl ?? repo.remoteUrl,
			remoteUrl: repo.remoteUrl,
			defaultBranch: repo.defaultBranch?.replace("refs/heads/", ""),
			project: repo.project,
		}));
};

export const getAzureDevopsBranches = async (
	input: z.infer<typeof apiFindAzureDevopsBranches>,
) => {
	const provider = await findAzureDevopsById(input.azureDevopsId);
	const project = encodeURIComponent(input.projectId);
	const repository = encodeURIComponent(input.repositoryId);
	const data = await fetchAzure<{
		value: Array<{ name: string; objectId: string }>;
	}>(
		provider,
		`${project}/_apis/git/repositories/${repository}/refs?filter=heads/&api-version=7.1`,
	);
	return data.value.map((branch) => ({
		name: branch.name.replace("refs/heads/", ""),
		commit: { sha: branch.objectId },
	}));
};

export const testAzureDevopsConnection = async (azureDevopsId: string) =>
	(await getAzureDevopsRepositories(azureDevopsId)).length;

interface CloneAzureDevopsRepository {
	appName: string;
	azureDevopsRemoteUrl: string | null;
	azureDevopsBranch: string | null;
	azureDevopsId: string | null;
	enableSubmodules: boolean;
	serverId: string | null;
	type?: "application" | "compose";
	outputPathOverride?: string;
}

export const cloneAzureDevopsRepository = async ({
	type = "application",
	...entity
}: CloneAzureDevopsRepository) => {
	let command = "set -e;";
	if (!entity.azureDevopsId || !entity.azureDevopsRemoteUrl) {
		return `${command}echo "Error: ❌ Azure DevOps Provider not found"; exit 1;`;
	}
	const provider = await findAzureDevopsById(entity.azureDevopsId);
	const remote = new URL(entity.azureDevopsRemoteUrl);
	if (remote.protocol !== "https:" || remote.hostname !== "dev.azure.com") {
		throw new Error("Invalid Azure DevOps repository URL");
	}
	remote.username = "dokploy";
	remote.password = provider.personalAccessToken;
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!entity.serverId);
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath =
		entity.outputPathOverride ?? join(basePath, entity.appName, "code");
	command += `rm -rf ${quote([outputPath])};mkdir -p ${quote([outputPath])};`;
	command += `echo ${quote([`Cloning Azure DevOps repository to ${outputPath}: ✅`])};`;
	command += `git clone --branch ${quote([entity.azureDevopsBranch ?? ""])} --depth 1 ${entity.enableSubmodules ? "--recurse-submodules" : ""} ${quote([remote.toString()])} ${quote([outputPath])} --progress;`;
	return command;
};
