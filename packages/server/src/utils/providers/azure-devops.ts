import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { findAzureDevopsById } from "@dokploy/server/services/azure-devops";
import { quote } from "shell-quote";
import {
	ExecError,
	execAsyncRemote,
	execAsyncStream,
} from "../process/execAsync";
import { AzureDevopsClient } from "./azure-devops-client";

const azureDevopsSecrets = (token: string) => {
	const encoded = Buffer.from(`:${token}`).toString("base64");
	return [`Authorization: Basic ${encoded}`, encoded, token];
};

const redactedOutput = (secrets: string[], write: (data: string) => void) => {
	let pending = "";
	return {
		append(chunk: string) {
			pending += chunk;
			let offset = 0;
			let safe = "";
			while (offset < pending.length) {
				const remaining = pending.slice(offset);
				const matched = secrets.find((secret) => remaining.startsWith(secret));
				if (matched) {
					safe += "[REDACTED]";
					offset += matched.length;
				} else if (secrets.some((secret) => secret.startsWith(remaining))) {
					break;
				} else {
					safe += pending[offset];
					offset++;
				}
			}
			pending = pending.slice(offset);
			if (safe) write(safe);
		},
		flush() {
			// An incomplete credential prefix must not be exposed after termination.
			if (pending) write("[REDACTED]");
			pending = "";
		},
	};
};

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
	const command = `set +x; unset GIT_CURL_VERBOSE; set -e; rm -rf -- ${quote([output])}; mkdir -p -- ${quote([output])}; git clone --progress --branch ${quote([source.azureDevopsBranch])} --depth 1 ${source.enableSubmodules ? "--recurse-submodules" : ""} -- ${quote([url, output])};`;
	const redact = (value: string) =>
		azureDevopsSecrets(token).reduce(
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
		if (source.serverId)
			await execAsyncRemote(
				source.serverId,
				`printf %s ${quote([Buffer.from(output).toString("base64")])} | base64 -d >> ${quote([source.logPath])}`,
			);
		else await appendFile(source.logPath, output);
	};
	let pendingLog = "";
	let logWrites = Promise.resolve();
	let logFailed = false;
	const queueLog = (output: string) => {
		if (!source.logPath || logFailed) return;
		pendingLog += output;
		logWrites = logWrites
			.then(async () => {
				const batch = pendingLog;
				pendingLog = "";
				if (batch && !logFailed) await log(batch);
			})
			.catch(() => {
				logFailed = true;
			});
	};
	const secrets = azureDevopsSecrets(provider.personalAccessToken);
	const output = {
		stdout: redactedOutput(secrets, queueLog),
		stderr: redactedOutput(secrets, queueLog),
	};
	let receivedOutput = false;
	const onData = (data: string, stream: "stdout" | "stderr" = "stdout") => {
		receivedOutput = true;
		output[stream].append(data);
	};
	let failed = false;
	let cloneError: unknown;
	try {
		if (source.serverId) {
			const exports = Object.entries(env)
				.filter(([key]) => key !== "GIT_CONFIG_VALUE_0")
				.map(([key, value]) => `export ${key}=${quote([value || ""])};`)
				.join("");
			await execAsyncRemote(
				source.serverId,
				`set +x; IFS= read -r DOKPLOY_AZURE_AUTH; export GIT_CONFIG_VALUE_0="$DOKPLOY_AZURE_AUTH"; unset DOKPLOY_AZURE_AUTH; ${exports} ${command}`,
				onData,
				`${env.GIT_CONFIG_VALUE_0}\n`,
				{ includeStream: true },
			);
		} else
			await execAsyncStream(command, onData, {
				env: { ...process.env, ...env },
				includeStream: true,
			});
	} catch (error) {
		failed = true;
		cloneError = error;
		if (!receivedOutput && error instanceof ExecError) {
			onData(error.stdout || "", "stdout");
			onData(error.stderr || "", "stderr");
		}
	} finally {
		output.stdout.flush();
		output.stderr.flush();
		await logWrites;
	}
	if (failed) {
		const stdout =
			cloneError instanceof ExecError ? redact(cloneError.stdout || "") : "";
		const stderr =
			cloneError instanceof ExecError ? redact(cloneError.stderr || "") : "";
		throw new ExecError(
			"Azure DevOps clone failed. Check repository access, branch and TLS connectivity.",
			{ command, stdout, stderr },
		);
	}
	if (logFailed)
		throw new Error(
			"Could not write Azure DevOps clone output to deployment log.",
		);
	return "";
};
