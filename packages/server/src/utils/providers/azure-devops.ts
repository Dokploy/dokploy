import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { findAzureDevopsById } from "@dokploy/server/services/azure-devops";
import { quote } from "shell-quote";
import { ExecError, execAsync, execAsyncRemote } from "../process/execAsync";
import { AzureDevopsClient } from "./azure-devops-client";

export interface AzureCloneSource {
	appName: string;
	azureDevopsId: string | null;
	azureDevopsProjectId: string | null;
	azureDevopsRepositoryId: string | null;
	azureDevopsBranch: string | null;
	enableSubmodules: boolean;
	serverId: string | null;
	type?: "application" | "compose";
	outputPathOverride?: string;
	logPath?: string;
}

export const prepareAzureDevopsClone = (
	source: AzureCloneSource,
	client: AzureDevopsClient,
	remoteUrl: string,
	token: string,
) => {
	if (!source.azureDevopsBranch)
		throw new Error("Azure DevOps branch is required");
	const url = client.cloneUrl(remoteUrl);
	const credentialScope = new URL(url);
	credentialScope.pathname = credentialScope.pathname
		.slice(0, new URL(client.baseUrl).pathname.length)
		.replace(/\/$/, "");
	const { APPLICATIONS_PATH, COMPOSE_PATH } = paths(!!source.serverId);
	const output =
		source.outputPathOverride ??
		join(
			source.type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH,
			source.appName,
			"code",
		);
	const header = `Authorization: Basic ${Buffer.from(`:${token}`).toString("base64")}`;
	const env: Record<string, string> = {
		GIT_TERMINAL_PROMPT: "0",
		GIT_SSL_NO_VERIFY: "false",
		GIT_TRACE: "0",
		GIT_TRACE_PACKET: "0",
		GIT_TRACE_CURL: "0",
		GIT_TRACE2: "0",
		GIT_TRACE2_EVENT: "0",
		GIT_TRACE2_PERF: "0",
		GIT_CONFIG_COUNT: "4",
		GIT_CONFIG_KEY_0: `http.${credentialScope.toString().replace(/\/$/, "")}/.extraHeader`,
		GIT_CONFIG_VALUE_0: header,
		GIT_CONFIG_KEY_1: "http.followRedirects",
		GIT_CONFIG_VALUE_1: "false",
		GIT_CONFIG_KEY_2: "credential.helper",
		GIT_CONFIG_VALUE_2: "",
		GIT_CONFIG_KEY_3: "protocol.file.allow",
		GIT_CONFIG_VALUE_3: "never",
	};
	// Credentials never enter the command, origin URL, or persistent Git config.
	// Git enables curl verbosity whenever this variable exists, even with "0".
	const command = `set +x; unset GIT_CURL_VERBOSE; set -e; rm -rf -- ${quote([output])}; mkdir -p -- ${quote([output])}; git clone --branch ${quote([source.azureDevopsBranch])} --depth 1 ${source.enableSubmodules ? "--recurse-submodules" : ""} -- ${quote([url, output])};`;
	const redact = (value: string) =>
		[token, Buffer.from(`:${token}`).toString("base64"), header].reduce(
			(safe, secret) => safe.split(secret).join("[REDACTED]"),
			value,
		);
	return { command, env, redact };
};

// Azure cloning executes separately so PATs are scoped to the clone process,
// never to the later build commands that execute repository-controlled code.
export const cloneAzureDevopsRepository = async (
	source: AzureCloneSource,
): Promise<string> => {
	if (
		!source.azureDevopsId ||
		!source.azureDevopsProjectId ||
		!source.azureDevopsRepositoryId
	)
		throw new Error("Azure DevOps source is incomplete");
	const provider = await findAzureDevopsById(source.azureDevopsId);
	const client = new AzureDevopsClient(
		provider.baseUrl,
		provider.personalAccessToken,
	);
	const repository = await client.repository(
		source.azureDevopsProjectId,
		source.azureDevopsRepositoryId,
	);
	const { command, env, redact } = prepareAzureDevopsClone(
		source,
		client,
		repository.remoteUrl,
		provider.personalAccessToken,
	);
	const log = async (output: string) => {
		if (!source.logPath) return;
		const safe = redact(output);
		if (source.serverId)
			await execAsyncRemote(
				source.serverId,
				`printf %s ${quote([Buffer.from(safe).toString("base64")])} | base64 -d >> ${quote([source.logPath])}`,
			);
		else await appendFile(source.logPath, safe);
	};
	try {
		let result: { stdout: string; stderr: string };
		if (source.serverId) {
			const exports = Object.entries(env)
				.filter(([key]) => key !== "GIT_CONFIG_VALUE_0")
				.map(([key, value]) => `export ${key}=${quote([value || ""])};`)
				.join("");
			result = await execAsyncRemote(
				source.serverId,
				`set +x; IFS= read -r DOKPLOY_AZURE_AUTH; export GIT_CONFIG_VALUE_0="$DOKPLOY_AZURE_AUTH"; unset DOKPLOY_AZURE_AUTH; ${exports} ${command}`,
				undefined,
				`${env.GIT_CONFIG_VALUE_0}\n`,
			);
		} else
			result = await execAsync(command, { env: { ...process.env, ...env } });
		await log(result.stdout + result.stderr);
	} catch (error) {
		const stdout = error instanceof ExecError ? redact(error.stdout || "") : "";
		const stderr = error instanceof ExecError ? redact(error.stderr || "") : "";
		await log(stdout + stderr);
		throw new ExecError(
			"Azure DevOps clone failed. Check repository access, branch and TLS connectivity.",
			{ command, stdout, stderr },
		);
	}
	return "";
};
