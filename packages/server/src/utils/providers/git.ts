import { createWriteStream } from "node:fs";
import path, { join } from "node:path";
import { paths } from "@/server/constants";
import type { Compose } from "@/server/services/compose";
import { findSSHKeyById, updateSSHKeyById } from "@/server/services/ssh-key";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export const cloneGitRepository = async (
	entity: {
		appName: string;
		customGitUrl?: string | null;
		customGitBranch?: string | null;
		customGitSSHKeyId?: string | null;
	},
	logPath: string,
	isCompose = false,
) => {
	const { SSH_PATH, COMPOSE_PATH, APPLICATIONS_PATH } = paths();
	const { appName, customGitUrl, customGitBranch, customGitSSHKeyId } = entity;

	if (!customGitUrl || !customGitBranch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error: Repository not found",
		});
	}

	const writeStream = createWriteStream(logPath, { flags: "a" });
	const temporalKeyPath = path.join("/tmp", "id_rsa");

	if (customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(customGitSSHKeyId);

		await execAsync(`
			echo "${sshKey.privateKey}" > ${temporalKeyPath}
			chmod 600 ${temporalKeyPath}
			`);
	}
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	try {
		if (!isHttpOrHttps(customGitUrl)) {
			if (!customGitSSHKeyId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Error: you are trying to clone a ssh repository without a ssh key, please set a ssh key",
				});
			}
			await addHostToKnownHosts(customGitUrl);
		}
		await recreateDirectory(outputPath);
		// const command = `GIT_SSH_COMMAND="ssh -i ${keyPath} -o UserKnownHostsFile=${knownHostsPath}" git clone --branch ${customGitBranch} --depth 1 ${customGitUrl} ${gitCopyPath} --progress`;
		// const { stdout, stderr } = await execAsync(command);
		writeStream.write(
			`\nCloning Repo Custom ${customGitUrl} to ${outputPath}: ✅\n`,
		);

		if (customGitSSHKeyId) {
			await updateSSHKeyById({
				sshKeyId: customGitSSHKeyId,
				lastUsedAt: new Date().toISOString(),
			});
		}

		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				customGitBranch,
				"--depth",
				"1",
				"--recurse-submodules",
				customGitUrl,
				outputPath,
				"--progress",
			],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
			{
				env: {
					...process.env,
					...(customGitSSHKeyId && {
						GIT_SSH_COMMAND: `ssh -i ${temporalKeyPath} -o UserKnownHostsFile=${knownHostsPath}`,
					}),
				},
			},
		);

		writeStream.write(`\nCloned Custom Git ${customGitUrl}: ✅\n`);
	} catch (error) {
		writeStream.write(`\nERROR Cloning Custom Git: ${error}: ❌\n`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getCustomGitCloneCommand = async (
	entity: {
		appName: string;
		customGitUrl?: string | null;
		customGitBranch?: string | null;
		customGitSSHKeyId?: string | null;
		serverId: string | null;
	},
	logPath: string,
	isCompose = false,
) => {
	const { SSH_PATH, COMPOSE_PATH, APPLICATIONS_PATH } = paths(true);
	const {
		appName,
		customGitUrl,
		customGitBranch,
		customGitSSHKeyId,
		serverId,
	} = entity;

	if (!customGitUrl || !customGitBranch) {
		const command = `
			echo  "Error: ❌ Repository not found" >> ${logPath};
			exit 1;
		`;

		await execAsyncRemote(serverId, command);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error: Repository not found",
		});
	}

	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (customGitSSHKeyId) {
		await updateSSHKeyById({
			sshKeyId: customGitSSHKeyId,
			lastUsedAt: new Date().toISOString(),
		});
	}
	try {
		const command = [];
		if (!isHttpOrHttps(customGitUrl)) {
			if (!customGitSSHKeyId) {
				command.push(
					`echo "Error: you are trying to clone a ssh repository without a ssh key, please set a ssh key ❌" >> ${logPath};
					 exit 1;
					`,
				);
			}
			command.push(addHostToKnownHostsCommand(customGitUrl));
		}
		command.push(`rm -rf ${outputPath};`);
		command.push(`mkdir -p ${outputPath};`);
		command.push(
			`echo "Cloning Custom Git ${customGitUrl}" to ${outputPath}: ✅ >> ${logPath};`,
		);
		if (customGitSSHKeyId) {
			const sshKey = await findSSHKeyById(customGitSSHKeyId);
			const gitSshCommand = `ssh -i /tmp/id_rsa -o UserKnownHostsFile=${knownHostsPath}`;
			command.push(
				`
				echo "${sshKey.privateKey}" > /tmp/id_rsa
				chmod 600 /tmp/id_rsa
				export GIT_SSH_COMMAND="${gitSshCommand}"
				`,
			);
		}

		command.push(
			`if ! git clone --branch ${customGitBranch} --depth 1 --recurse-submodules --progress ${customGitUrl} ${outputPath} >> ${logPath} 2>&1; then
				echo "❌ [ERROR] Fail to clone the repository ${customGitUrl}" >> ${logPath};
				exit 1;
			fi
			`,
		);
		command.push(`echo "Cloned Custom Git ${customGitUrl}: ✅" >> ${logPath};`);
		return command.join("\n");
	} catch (error) {
		console.log(error);
		throw error;
	}
};

const isHttpOrHttps = (url: string): boolean => {
	const regex = /^https?:\/\//;
	return regex.test(url);
};

const addHostToKnownHosts = async (repositoryURL: string) => {
	const { SSH_PATH } = paths();
	const { domain, port } = sanitizeRepoPathSSH(repositoryURL);
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	const command = `ssh-keyscan -p ${port} ${domain} >> ${knownHostsPath}`;
	try {
		await execAsync(command);
	} catch (error) {
		console.error(`Error adding host to known_hosts: ${error}`);
		throw error;
	}
};

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
			/(?<domain>[^\s\/\?#:]+)/,
			/(?::(?<port>[0-9]{1,5}))?/,
			/(?:[\/:](?<owner>[^\s\/\?#:]+))?/,
			/(?:[\/:](?<repo>(?:[^\s\?#:.]|\.(?!git\/?\s*$))+))/,
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

export const cloneGitRawRepository = async (entity: {
	appName: string;
	customGitUrl?: string | null;
	customGitBranch?: string | null;
	customGitSSHKeyId?: string | null;
}) => {
	const { appName, customGitUrl, customGitBranch, customGitSSHKeyId } = entity;

	if (!customGitUrl || !customGitBranch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error: Repository not found",
		});
	}

	const { SSH_PATH, COMPOSE_PATH } = paths();
	const temporalKeyPath = path.join("/tmp", "id_rsa");
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (customGitSSHKeyId) {
		const sshKey = await findSSHKeyById(customGitSSHKeyId);

		await execAsync(`
			echo "${sshKey.privateKey}" > ${temporalKeyPath}
			chmod 600 ${temporalKeyPath}
			`);
	}

	try {
		if (!isHttpOrHttps(customGitUrl)) {
			if (!customGitSSHKeyId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Error: you are trying to clone a ssh repository without a ssh key, please set a ssh key",
				});
			}
			await addHostToKnownHosts(customGitUrl);
		}
		await recreateDirectory(outputPath);

		if (customGitSSHKeyId) {
			await updateSSHKeyById({
				sshKeyId: customGitSSHKeyId,
				lastUsedAt: new Date().toISOString(),
			});
		}

		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				customGitBranch,
				"--depth",
				"1",
				"--recurse-submodules",
				customGitUrl,
				outputPath,
				"--progress",
			],
			(data) => {},
			{
				env: {
					...process.env,
					...(customGitSSHKeyId && {
						GIT_SSH_COMMAND: `ssh -i ${temporalKeyPath} -o UserKnownHostsFile=${knownHostsPath}`,
					}),
				},
			},
		);
	} catch (error) {
		throw error;
	}
};

export const cloneRawGitRepositoryRemote = async (compose: Compose) => {
	const {
		appName,
		customGitBranch,
		customGitUrl,
		customGitSSHKeyId,
		serverId,
	} = compose;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	if (!customGitUrl) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Git Provider not found",
		});
	}

	const { SSH_PATH, COMPOSE_PATH } = paths(true);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	if (customGitSSHKeyId) {
		await updateSSHKeyById({
			sshKeyId: customGitSSHKeyId,
			lastUsedAt: new Date().toISOString(),
		});
	}
	try {
		const command = [];
		if (!isHttpOrHttps(customGitUrl)) {
			if (!customGitSSHKeyId) {
				command.push(
					`echo "Error: you are trying to clone a ssh repository without a ssh key, please set a ssh key ❌" ;
					 exit 1;
					`,
				);
			}
			command.push(addHostToKnownHostsCommand(customGitUrl));
		}
		command.push(`rm -rf ${outputPath};`);
		command.push(`mkdir -p ${outputPath};`);
		if (customGitSSHKeyId) {
			const sshKey = await findSSHKeyById(customGitSSHKeyId);
			const gitSshCommand = `ssh -i /tmp/id_rsa -o UserKnownHostsFile=${knownHostsPath}`;
			command.push(
				`
				echo "${sshKey.privateKey}" > /tmp/id_rsa
				chmod 600 /tmp/id_rsa
				export GIT_SSH_COMMAND="${gitSshCommand}"
				`,
			);
		}

		command.push(
			`if ! git clone --branch ${customGitBranch} --depth 1 --recurse-submodules --progress ${customGitUrl} ${outputPath} ; then
				echo "[ERROR] Fail to clone the repository ";
				exit 1;
			fi
			`,
		);

		await execAsyncRemote(serverId, command.join("\n"));
	} catch (error) {
		throw error;
	}
};
