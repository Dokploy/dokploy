import { findServerById } from "@dokploy/server/services/server";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
import { Client, type ClientChannel } from "ssh2";
import { sshKeepalive } from "../process/execAsync";
import {
	buildSandboxKillCommand,
	createSandboxOutputSink,
	getSandboxKillMarker,
	SANDBOX_EXEC_KILL_GRACE_MS,
	SANDBOX_EXEC_MARKER_ENV,
	SANDBOX_EXEC_MAX_OUTPUT_BYTES,
	SANDBOX_EXEC_TIMEOUT_EXIT_CODE,
	type SandboxExecOptions,
	type SandboxExecResult,
	toSandboxEnvArray,
} from "./exec";

const SSH_READY_TIMEOUT_MS = 20_000;

export const canUseSandboxRemoteExec = (
	env?: Record<string, string> | string[],
) => toSandboxEnvArray(env).every((entry) => !/[\r\n\0]/.test(entry));

export const buildSandboxRemoteExecScript = (
	containerId: string,
	options: Pick<SandboxExecOptions, "cmd" | "cwd" | "env" | "user">,
	marker: string,
	goneToken: string,
) => {
	const delimiter = `DOKPLOY_ENV_${nanoid().replace(/[^a-zA-Z0-9]/g, "")}`;
	const container = quote([containerId]);
	const args = [
		"docker exec --env-file /dev/fd/3",
		...(options.cwd ? [`-w ${quote([options.cwd])}`] : []),
		...(options.user ? [`-u ${quote([options.user])}`] : []),
		container,
		`sh -c ${quote([options.cmd])}`,
		`</dev/null 3<<'${delimiter}'`,
	];
	return [
		args.join(" "),
		...toSandboxEnvArray(options.env),
		`${SANDBOX_EXEC_MARKER_ENV}=${marker}`,
		delimiter,
		"c=$?",
		`if [ "$c" -ne 0 ] && [ "$(docker container inspect -f '{{.State.Running}}' ${container} 2>/dev/null)" != true ]; then echo ${goneToken} >&2; fi`,
		'exit "$c"',
		"",
	].join("\n");
};

const connect = async (serverId: string) => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH key available for this server");
	}
	return new Promise<Client>((resolve, reject) => {
		const conn = new Client();
		conn
			.once("ready", () => resolve(conn))
			.once("error", (error) => {
				conn.end();
				reject(new Error(`SSH connection error: ${error.message}`));
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				readyTimeout: SSH_READY_TIMEOUT_MS,
				...sshKeepalive,
			});
	});
};

const openChannel = (conn: Client, command: string) =>
	new Promise<ClientChannel>((resolve, reject) => {
		conn.exec(command, (error, stream) =>
			error ? reject(error) : resolve(stream),
		);
	});

const runAndWait = async (conn: Client, command: string) => {
	const stream = await openChannel(conn, command);
	stream.resume();
	stream.stderr.resume();
	return new Promise<number | null>((resolve) => {
		stream.once("close", (code: number | null) => resolve(code));
	});
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const containerGoneError = (containerId: string) =>
	Object.assign(new Error(`No such container: ${containerId}`), {
		statusCode: 404,
	});

export const runSandboxExecRemote = async (
	serverId: string,
	containerId: string,
	options: SandboxExecOptions,
): Promise<SandboxExecResult> => {
	const marker = nanoid();
	const goneToken = `dokploy-gone-${nanoid()}`;
	const script = buildSandboxRemoteExecScript(
		containerId,
		options,
		marker,
		goneToken,
	);
	const conn = await connect(serverId);
	try {
		const stream = await openChannel(conn, "sh");

		const maxBytes = options.maxOutputBytes ?? SANDBOX_EXEC_MAX_OUTPUT_BYTES;
		const state = { truncated: false };
		let gone = false;
		let stderrTail = "";
		const stdout = createSandboxOutputSink(maxBytes, options.onStdout, state);
		const stderr = createSandboxOutputSink(
			maxBytes,
			(chunk) => {
				stderrTail = (stderrTail + chunk).slice(-2 * goneToken.length);
				if (stderrTail.includes(goneToken)) gone = true;
				const visible = chunk.split(`${goneToken}\n`).join("");
				if (visible) options.onStderr?.(visible);
			},
			state,
		);

		const finished = new Promise<number | null>((resolve, reject) => {
			stream.once("close", (code: number | null) => resolve(code));
			stream.once("error", reject);
		});
		stream.pipe(stdout.sink);
		stream.stderr.pipe(stderr.sink);
		stream.end(script);

		let timedOut = false;
		let containerKilled = false;
		let timeoutTask: Promise<void> | null = null;
		const timer = setTimeout(() => {
			timedOut = true;
			timeoutTask = (async () => {
				const container = quote([containerId]);
				const killArgs = [
					`-e ${SANDBOX_EXEC_MARKER_ENV}=${quote([getSandboxKillMarker(marker)])}`,
					...(options.user ? [`-u ${quote([options.user])}`] : []),
				].join(" ");
				await runAndWait(
					conn,
					`docker exec ${killArgs} ${container} sh -c ${quote([buildSandboxKillCommand(marker)])}`,
				).catch(() => {});
				const ended = await Promise.race([
					finished.then(
						() => true,
						() => true,
					),
					sleep(SANDBOX_EXEC_KILL_GRACE_MS).then(() => false),
				]);
				if (!ended) {
					const code = await runAndWait(
						conn,
						`docker kill -s KILL ${container}`,
					).catch(() => null);
					containerKilled = code === 0;
					stream.destroy();
				}
			})();
		}, options.timeoutMs);

		let code: number | null = null;
		try {
			code = await finished;
		} finally {
			clearTimeout(timer);
		}
		if (timeoutTask) await timeoutTask;

		if (gone && !timedOut) throw containerGoneError(containerId);

		return {
			stdout: stdout.text(),
			stderr: stderr.text().split(`${goneToken}\n`).join(""),
			exitCode: timedOut ? SANDBOX_EXEC_TIMEOUT_EXIT_CODE : (code ?? 1),
			timedOut,
			truncated: state.truncated,
			containerKilled,
		};
	} finally {
		conn.end();
	}
};
