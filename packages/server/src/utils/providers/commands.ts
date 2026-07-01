import {
	quoteEnvironmentAssignment,
	quoteShellArgs,
	quoteShellArgument,
} from "../shell";

export const buildProviderEchoCommand = (message: string) =>
	`echo ${quoteShellArgument(message)};`;

export const buildRemovePathCommand = (targetPath: string) =>
	`${quoteShellArgs(["rm", "-rf", "--", targetPath])};`;

export const buildCreateDirectoryCommand = (targetPath: string) =>
	`${quoteShellArgs(["mkdir", "-p", "--", targetPath])};`;

export const buildGitCloneCommand = ({
	branch,
	cloneUrl,
	enableSubmodules,
	outputPath,
}: {
	branch: string;
	cloneUrl: string;
	enableSubmodules?: boolean;
	outputPath: string;
}) => {
	const args = [
		"git",
		"-c",
		"http.followRedirects=false",
		"clone",
		"--branch",
		branch,
		"--depth",
		"1",
	];

	if (enableSubmodules) {
		args.push("--recurse-submodules");
	}

	args.push("--progress", "--", cloneUrl, outputPath);

	return quoteShellArgs(args);
};

export const buildKnownHostsCommand = ({
	domain,
	knownHostsPath,
	port,
}: {
	domain: string;
	knownHostsPath: string;
	port: number;
}) =>
	// ssh-keyscan is best-effort; the clone still owns the host-key decision.
	`${quoteShellArgs(["ssh-keyscan", "-p", String(port), domain])} >> ${quoteShellArgument(knownHostsPath)} || true;`;

export const buildPrivateKeyWriteCommand = (
	privateKey: string,
	targetPath: string,
) => {
	const encodedKey = Buffer.from(privateKey).toString("base64");

	return `echo ${quoteShellArgument(encodedKey)} | base64 -d > ${quoteShellArgument(targetPath)};`;
};

export const buildGitSshEnvironmentCommand = ({
	knownHostsPath,
	port,
	privateKeyPath,
}: {
	knownHostsPath: string;
	port?: number;
	privateKeyPath: string;
}) => {
	const commandArgs = ["ssh", "-i", privateKeyPath];

	if (port) {
		commandArgs.push("-p", String(port));
	}

	commandArgs.push("-o", `UserKnownHostsFile=${knownHostsPath}`);
	commandArgs.push("-o", "StrictHostKeyChecking=accept-new");

	return `export ${quoteEnvironmentAssignment("GIT_SSH_COMMAND", quoteShellArgs(commandArgs))};`;
};
