import path, { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import {
	findSSHKeyById,
	updateSSHKeyById,
} from "@dokploy/server/services/ssh-key";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { redactSensitiveText } from "../security/redaction";
import { quoteShellArgs } from "../shell";
import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
} from "../url/network";
import {
	buildCreateDirectoryCommand,
	buildGitCloneCommand,
	buildGitSshEnvironmentCommand,
	buildKnownHostsCommand,
	buildPrivateKeyWriteCommand,
	buildProviderEchoCommand,
	buildRemovePathCommand,
} from "./commands";

interface CloneGitRepository {
	appName: string;
	customGitUrl?: string | null;
	customGitBranch?: string | null;
	customGitSSHKeyId?: string | null;
	enableSubmodules?: boolean;
	serverId: string | null;
	type?: "application" | "compose";
	outputPathOverride?: string;
}

const customGitUrlHostname = (customGitUrl: string) => {
	if (isHttpOrHttps(customGitUrl) || customGitUrl.startsWith("ssh://")) {
		try {
			return new URL(customGitUrl).hostname;
		} catch {
			throw new Error(`Malformatted Git URL: ${customGitUrl}`);
		}
	}

	return sanitizeRepoPathSSH(customGitUrl).domain;
};

export const assertCustomGitUrlAllowed = async (
	customGitUrl: string,
	options: {
		enforcePublicHost?: boolean;
		lookup?: HostnameLookup;
	} = {},
) => {
	const enforcePublicHost = options.enforcePublicHost ?? IS_CLOUD;
	if (!enforcePublicHost) {
		return;
	}

	const hostname = customGitUrlHostname(customGitUrl);
	if (!hostname) {
		throw new Error(`Malformatted Git URL: ${customGitUrl}`);
	}

	await assertCloudHostResolvesPublic(hostname, {
		fieldName: "Custom Git URL",
		lookup: options.lookup,
	});
};

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
		outputPathOverride,
	} = entity;
	const { SSH_PATH, COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);

	if (!customGitUrl || !customGitBranch) {
		command += `${buildProviderEchoCommand("Error: ❌ Repository not found")} exit 1;`;
		return command;
	}

	await assertCustomGitUrlAllowed(customGitUrl);
	const redactedCustomGitUrl = redactSensitiveText(customGitUrl);

	const temporalKeyPath = path.join("/tmp", "id_rsa");

	if (customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(customGitSSHKeyId);

		command += buildPrivateKeyWriteCommand(sshKey.privateKey, temporalKeyPath);
		command += `${quoteShellArgs(["chmod", "600", temporalKeyPath])};`;
	}
	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = outputPathOverride ?? join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (!isHttpOrHttps(customGitUrl)) {
		if (!customGitSSHKeyId) {
			command += `${buildProviderEchoCommand("Error: ❌ You are trying to clone a ssh repository without a ssh key, please set a ssh key")} exit 1;`;
			return command;
		}
		command += addHostToKnownHostsCommand(customGitUrl);
	}
	command += buildRemovePathCommand(outputPath);
	command += buildCreateDirectoryCommand(outputPath);
	command += buildProviderEchoCommand(
		`Cloning Repo Custom ${redactedCustomGitUrl} to ${outputPath}: ✅`,
	);

	if (customGitSSHKeyId) {
		await updateSSHKeyById({
			sshKeyId: customGitSSHKeyId,
			lastUsedAt: new Date().toISOString(),
		});
	}

	if (customGitSSHKeyId) {
		const { port } = sanitizeRepoPathSSH(customGitUrl);
		command += buildGitSshEnvironmentCommand({
			knownHostsPath,
			port,
			privateKeyPath: temporalKeyPath,
		});
	}
	command += `if ! ${buildGitCloneCommand({
		branch: customGitBranch,
		cloneUrl: customGitUrl,
		enableSubmodules,
		outputPath,
	})}; then
					${buildProviderEchoCommand(`❌ [ERROR] Fail to clone the repository ${redactedCustomGitUrl}`)}
					exit 1;
				fi
			`;

	return command;
};

const isHttpOrHttps = (url: string): boolean => {
	const regex = /^https?:\/\//;
	return regex.test(url);
};

const addHostToKnownHostsCommand = (repositoryURL: string) => {
	const { SSH_PATH } = paths(true);
	const { domain, port } = sanitizeRepoPathSSH(repositoryURL);
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (!domain) {
		throw new Error(`Malformatted SSH path: ${repositoryURL}`);
	}

	return buildKnownHostsCommand({
		domain,
		knownHostsPath,
		port,
	});
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
		const gitCommand = quoteShellArgs([
			"git",
			"-C",
			outputPath,
			"log",
			"-1",
			"--pretty=format:%H---DELIMITER---%B",
		]);
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
