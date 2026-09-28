import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";

export interface DockerImage {
	Repository: string;
	Tag: string;
	ID: string;
	Digest?: string;
	CreatedAt: string;
	CreatedSince: string;
	Size: string;
	SharedSize?: string;
	UniqueSize?: string;
	VirtualSize?: string;
}

export const getImages = async (serverId?: string) => {
	try {
		const command = "docker images --format '{{json .}}'";
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as DockerImage);
	} catch (error) {
		console.error(error);
		return [];
	}
};

export const getImageConfig = async (imageRef: string, serverId?: string) => {
	const command = `docker image inspect ${quote([String(imageRef ?? "")])}`;
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	return JSON.parse(stdout.trim())[0];
};

interface RemoveImageParams {
	repository: string;
	tag: string;
	id: string;
	force?: boolean;
}

export const removeImage = async (
	{ repository, tag, id, force }: RemoveImageParams,
	serverId?: string,
) => {
	const hasTaggedReference =
		repository && tag && repository !== "<none>" && tag !== "<none>";
	const reference = hasTaggedReference ? `${repository}:${tag}` : id;
	const command = `docker rmi ${force ? "-f " : ""}${quote([String(reference ?? "")])}`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
