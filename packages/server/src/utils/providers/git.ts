import path, { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	findSSHKeyById,
	updateSSHKeyById,
} from "@dokploy/server/services/ssh-key";
import { execAsync, execAsyncRemote } from "../process/execAsync";

interface CloneGitRepository {
	appName: string;
	customGitUrl?: string | null;
	customGitBranch?: string | null;
	customGitSSHKeyId?: string | null;
	enableSubmodules?: boolean;
	serverId: string | null;
	type?: "application" | "compose";
}

export const cloneGitRepository = async ({
	type = "application",
	...entity
}: CloneGitRepository) => {
	let command = "set -e;";
	const {
		appName,
		customGitUrl,
		customGitBranch,
		customGitSSHKeyId,
		enableSubmodules,
		serverId,
	} = entity;
	const { SSH_PATH, COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);

	if (!customGitUrl || !customGitBranch) {
		command += `echo "Error: ❌ Repository not found"; exit 1;`;
		return command;
	}

	const temporalKeyPath = path.join("/tmp", "id_rsa");

	if (customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(customGitSSHKeyId);

		command += `
			echo "${sshKey.privateKey}" > ${temporalKeyPath}
			chmod 600 ${temporalKeyPath};
			`;
	}
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (!isHttpOrHttps(customGitUrl)) {
		if (!customGitSSHKeyId) {
			command += `echo "Error: ❌ You are trying to clone a ssh repository without a ssh key, please set a ssh key"; exit 1;`;
			return command;
		}
		command += addHostToKnownHostsCommand(customGitUrl);
	}
	command += `rm -rf ${outputPath};`;
	command += `mkdir -p ${outputPath};`;
	command += `echo "Cloning Repo Custom ${customGitUrl} to ${outputPath}: ✅";`;

	if (customGitSSHKeyId) {
		await updateSSHKeyById({
			sshKeyId: customGitSSHKeyId,
			lastUsedAt: new Date().toISOString(),
		});
	}

	if (customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(customGitSSHKeyId);
		const { port } = sanitizeRepoPathSSH(customGitUrl);
		const gitSshCommand = `ssh -i /tmp/id_rsa${port ? ` -p ${port}` : ""} -o UserKnownHostsFile=${knownHostsPath}`;
		command += `echo "${sshKey.privateKey}" > /tmp/id_rsa;`;
		command += "chmod 600 /tmp/id_rsa;";
		command += `export GIT_SSH_COMMAND="${gitSshCommand}";`;
	}
	command += `if ! git clone --branch ${customGitBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} --progress ${customGitUrl} ${outputPath}; then
				echo "❌ [ERROR] Fail to clone the repository ${customGitUrl}";
				exit 1;
			fi
			`;

	return command;
};

const isHttpOrHttps = (url: string): boolean => {
	const regex = /^https?:\/\//;
	return regex.test(url);
};

// const addHostToKnownHosts = async (repositoryURL: string) => {
// 	const { SSH_PATH } = paths();
// 	const { domain, port } = sanitizeRepoPathSSH(repositoryURL);
// 	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

// 	const command = `ssh-keyscan -p ${port} ${domain} >> ${knownHostsPath}`;
// 	try {
// 		await execAsync(command);
// 	} catch (error) {
// 		console.error(`Error adding host to known_hosts: ${error}`);
// 		throw error;
// 	}
// };

const addHostToKnownHostsCommand = (repositoryURL: string) => {
	const { SSH_PATH } = paths(true);
	const { domain, port } = sanitizeRepoPathSSH(repositoryURL);
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	return `ssh-keyscan -p ${port} ${domain} >> ${knownHostsPath};`;
};
const sanitizeRepoPathSSH = (input: string) => {
	const SSH_PATH_RE = new RegExp(
		[
			/^\s*/,
			/(?:(?<proto>[a-z]+):\/\/)?/,
			/(?:(?<user>[a-z_][a-z0-9_-]+)@)?/,
			/(?<domain>[^\s/?#:]+)/,
			/(?::(?<port>[0-9]{1,5}))?/,
			/(?:[/:](?<owner>[^\s/?#:]+))?/,
			/(?:[/:](?<repo>(?:[^\s?#:.]|\.(?!git\/?\s*$))+))/,
			/(?:.git)?\/?\s*$/,
		]
			.map((r) => r.source)
			.join(""),
		"i",
	);

	const found = input.match(SSH_PATH_RE);
	if (!found) {
		throw new Error(`Malformatted SSH path: ${input}`);
	}

	return {
		user: found.groups?.user ?? "git",
		domain: found.groups?.domain,
		port: Number(found.groups?.port ?? 22),
		owner: found.groups?.owner ?? "",
		repo: found.groups?.repo,
		get repoPath() {
			return `ssh://${this.user}@${this.domain}:${this.port}/${this.owner}${
				this.owner && "/"
			}${this.repo}.git`;
		},
	};
};

interface Props {
	appName: string;
	type?: "application" | "compose";
	serverId: string | null;
}

export const getGitCommitInfo = async ({
	appName,
	type = "application",
	serverId,
}: Props) => {
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	let stdoutResult = "";
	const result = {
		message: "",
		hash: "",
	};
	try {
		const gitCommand = `git -C ${outputPath} log -1 --pretty=format:"%H---DELIMITER---%B"`;
		if (serverId) {
			const { stdout } = await execAsyncRemote(serverId, gitCommand);
			stdoutResult = stdout.trim();
		} else {
			const { stdout } = await execAsync(gitCommand);
			stdoutResult = stdout.trim();
		}

		const parts = stdoutResult.split("---DELIMITER---");
		if (parts && parts.length === 2) {
			result.hash = parts[0]?.trim() || "";
			result.message = parts[1]?.trim() || "";
		}
	} catch (error) {
		console.error(`Error getting git commit info: ${error}`);
		return null;
	}
	return result;
};
