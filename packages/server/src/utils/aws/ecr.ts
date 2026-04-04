import {
	DescribeImagesCommand,
	DescribeRepositoriesCommand,
	ECRClient,
	GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import { shEscape } from "../../db/schema/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";

export interface ECRCredentials {
	awsAccessKeyId: string;
	awsSecretAccessKey: string;
	awsRegion: string;
	registryUrl?: string;
}

function createECRClient(credentials: ECRCredentials): ECRClient {
	return new ECRClient({
		region: credentials.awsRegion,
		credentials: {
			accessKeyId: credentials.awsAccessKeyId,
			secretAccessKey: credentials.awsSecretAccessKey,
		},
	});
}

/**
 * Fetches a Docker-compatible auth token from AWS ECR.
 *
 * The returned token is valid for 12 hours. We fetch a fresh token on every
 * operation rather than caching, because operations (deploys, rollbacks) are
 * short-lived and a stale token would cause hard-to-debug failures.
 * If caching becomes necessary, this is the single point to add it.
 */
export async function getECRAuthToken(
	credentials: ECRCredentials,
): Promise<{ username: string; password: string; endpoint: string }> {
	const client = createECRClient(credentials);
	const response = await client.send(new GetAuthorizationTokenCommand({}));

	const authData = response.authorizationData?.[0];
	if (!authData?.authorizationToken || !authData.proxyEndpoint) {
		throw new Error("Failed to get ECR authorization token");
	}

	// Token is base64-encoded "AWS:<password>"
	const decoded = Buffer.from(authData.authorizationToken, "base64").toString(
		"utf-8",
	);
	const colonIdx = decoded.indexOf(":");
	const username = decoded.slice(0, colonIdx);
	const password = decoded.slice(colonIdx + 1);
	if (!username || !password) {
		throw new Error("Invalid ECR authorization token format");
	}

	return {
		username,
		password,
		endpoint: authData.proxyEndpoint,
	};
}

export async function listECRRepositories(
	credentials: ECRCredentials,
): Promise<string[]> {
	const client = createECRClient(credentials);
	const repos: string[] = [];
	let nextToken: string | undefined;

	do {
		const response = await client.send(
			new DescribeRepositoriesCommand({ nextToken }),
		);
		for (const repo of response.repositories ?? []) {
			if (repo.repositoryName) {
				repos.push(repo.repositoryName);
			}
		}
		nextToken = response.nextToken;
	} while (nextToken);

	return repos;
}

export async function listECRImageTags(
	credentials: ECRCredentials,
	repositoryName: string,
): Promise<string[]> {
	const client = createECRClient(credentials);
	const tags: string[] = [];
	let nextToken: string | undefined;

	do {
		const response = await client.send(
			new DescribeImagesCommand({ repositoryName, nextToken }),
		);
		for (const image of response.imageDetails ?? []) {
			for (const tag of image.imageTags ?? []) {
				tags.push(tag);
			}
		}
		nextToken = response.nextToken;
	} while (nextToken);

	return tags.sort();
}

/**
 * Logs Docker into an ECR registry by fetching a fresh auth token via the
 * AWS SDK and running `docker login`. Executes locally or on a remote server.
 */
export async function loginDockerToECR(
	credentials: ECRCredentials,
	serverId?: string,
): Promise<void> {
	const { password } = await getECRAuthToken(credentials);
	const registryUrl = credentials.registryUrl || "";
	const escapedPassword = shEscape(password);
	const escapedRegistry = shEscape(registryUrl);

	const loginCommand = `printf %s ${escapedPassword} | docker login --username AWS --password-stdin ${escapedRegistry}`;

	if (serverId && serverId !== "none") {
		await execAsyncRemote(serverId, loginCommand);
	} else {
		await execAsync(loginCommand);
	}
}
